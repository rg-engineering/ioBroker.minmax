# Architektur- und Verhaltensentwurf für den TypeScript-Umbau

Dieses Dokument hält die fachlichen Anforderungen und den Architekturentwurf für das Redesign des ioBroker-Adapters `minmax` fest. Es dient als Referenz für die spätere Implementierung. Die hier beschriebenen Entscheidungen sind Anforderungen; die konkrete Umsetzung ist noch nicht begonnen.

## Ziel des Adapters

Der Adapter überwacht vom Benutzer ausgewählte ioBroker-Datenpunkte und ermittelt deren Minimum und Maximum für den aktuellen Tag, Monat und das aktuelle Jahr. Optional berechnet er pro Zeitraum zusätzlich die Differenz zwischen Maximum und Minimum.

Die reguläre Verarbeitung erfolgt bei Zustandsänderungen. Zusätzlich muss der Adapter Tages-, Monats- und Jahreswechsel erkennen und die Werte für den neuen Zeitraum initialisieren.

## Objektkonfiguration und Instanzen

Die Einstellungen eines überwachten Datenpunkts liegen in dessen `common.custom`-Eintrag. Die relevanten Felder sind:

- `enabled`: Überwachung aktivieren oder deaktivieren
- `logName`: Name beziehungsweise ID-Basis der vom Adapter erzeugten Ausgabedatenpunkte
- `calcDiff`: Differenzwerte für Tag, Monat und Jahr berechnen

Der Schlüssel in `common.custom` muss dynamisch dem Namespace der laufenden Adapterinstanz entsprechen, beispielsweise `minmax.0` oder `minmax.1`. `minmax.0` darf nicht fest im Code codiert werden.

Jede Instanz verarbeitet ausschließlich ihren eigenen Custom-Eintrag. Die Eindeutigkeit von `logName` wird innerhalb derselben Instanz geprüft; verschiedene Instanzen dürfen denselben Namen verwenden.

`common.custom` ist die vorgesehene maßgebliche Quelle für `enabled`, `logName` und `calcDiff`. Eine zusätzliche JSON-Datei als zweite Konfigurationsquelle soll vermieden werden, da beide Speicher auseinanderlaufen könnten. Die alte Implementierung hat ihre Objektkonfiguration ebenfalls in einer JSON-Datei gespeichert. Ob und wie diese Altdatei beim Umstieg migriert oder ignoriert wird, ist noch zu entscheiden.

## Messwerte und Validierung

- Es werden ausschließlich numerische Zustandswerte verarbeitet.
- Numerische Strings werden nicht als Zahlen interpretiert.
- Bei Aktivierung oder Änderung eines Quellobjekts wird dessen ioBroker-Objekttyp geprüft. Ist er nicht numerisch, wird ein Fehler mit dem Hinweis `wrong configuration` geloggt und der Datenpunkt nicht aktiviert.
- Ein später eintreffender nichtnumerischer Zustandswert wird ignoriert und nicht verrechnet.
- Doppelte `logName`s innerhalb einer Adapterinstanz sind eine Fehlkonfiguration. Ein neues oder geändertes Objekt mit einem bereits verwendeten Namen wird nicht aktiviert; der bestehende Tracker bleibt aktiv. Der Konflikt wird geloggt.

## Verarbeitung und Kalenderwechsel

### Beim Adapterstart

Für jeden gültig konfigurierten und aktivierten Quell-Datenpunkt wird der aktuelle Zustand erneut gelesen und als Messwert berücksichtigt. Vorhandene Minima und Maxima des laufenden Zeitraums dürfen dadurch nicht pauschal überschrieben werden; der Wert wird regulär mit ihnen verglichen.

### Bei einer Zustandsänderung

Ein numerischer Messwert wird mit den bestehenden Tages-, Monats- und Jahreswerten verglichen. Neue Minima beziehungsweise Maxima und deren Zeit- oder Datumsangaben werden aktualisiert, wenn der Messwert einen bisherigen Extremwert übertrifft oder ein neuer Zeitraum initialisiert werden muss.

### Bei Tages-, Monats- und Jahreswechseln

Kalendergrenzen werden mit Cron erkannt. Die Zeitzone aus der Adapterkonfiguration bestimmt die Grenzen, unabhängig von der Host-Zeitzone. Die Zeitzone ist bereits in der Adapterkonfiguration vorgesehen (unter anderem in `jsonConfig.json5` und `adapter-config.d.ts`).

Bei jeder relevanten Grenze wird für aktive Datenpunkte der aktuelle Quellwert gelesen und als Minimum und Maximum des neuen Zeitraums berücksichtigt – auch dann, wenn seit der Grenze kein Zustandswechsel eingetreten ist. Überschneidende Grenzen, wie Monats- oder Jahreswechsel, müssen konsistent in einem Durchlauf verarbeitet werden.

## Deaktivierung und Reaktivierung

Wird ein Datenpunkt deaktiviert, endet dessen weitere Überwachung und Min-/Max-Berechnung. Bereits erzeugte Ausgabeobjekte und deren Werte bleiben erhalten. So bleiben die gespeicherten Statistiken und die vorhandene History erhalten.

Bei einer späteren Reaktivierung werden die vorhandenen Werte weiterverwendet und mit dem aktuellen Messwert fortgesetzt. Da während der Deaktivierung Kalendergrenzen verpasst worden sein können, muss der Adapter feststellen, ob die gespeicherten Statistiken noch zum aktuellen Tag, Monat und Jahr gehören. Abgelaufene Perioden werden beim Wiederaktivieren neu initialisiert.

Zu jedem Extremwert gibt es bereits einen zugehörigen Zeit- oder Datums-Datenpunkt. Diese Angaben sollen für die Wiederherstellung vorhandener Statistiken ausgewertet werden. Sie bezeichnen jedoch den Zeitpunkt, an dem das jeweilige Extrem auftrat, und nicht unbedingt den Beginn des Zeitraums. Außerdem enthalten die Tagesfelder (`TodayMinTime`, `TodayMaxTime`) nur die Uhrzeit, kein Datum. Daher ist vor der Implementierung zu prüfen, ob diese Datenpunkte allein eine zuverlässige Erkennung abgelaufener Zeiträume erlauben. Falls nicht, werden zusätzliche Periodenkennungen benötigt; diese sollen dann in einer adapterlokalen JSON-Datei im ioBroker-Datenverzeichnis gespeichert werden. Ein weiterer sichtbarer Statistik-Datenpunkt soll dafür nicht angelegt werden.

## Änderungen an der Konfiguration

- **`logName` geändert:** Die aktuellen Adapter-Ausgabewerte und -objekte sollen möglichst auf die IDs des neuen Namens übertragen werden. Anschließend können die alten Adapter-Ausgabeobjekte entfernt werden. Externe History-Daten, die unter den alten IDs gespeichert wurden, lassen sich dabei möglicherweise nicht übertragen und verbleiben dann dort.
- **`calcDiff` ausgeschaltet:** Die Differenzberechnung wird beendet und die zugehörigen Differenz-Datenpunkte (`TodayDiff`, `MonthDiff`, `YearDiff`) werden entfernt.
- **Datenpunkt deaktiviert:** Im Unterschied zum Abschalten von `calcDiff` bleiben die vorhandenen Min-/Max-Ausgabeobjekte und deren Werte erhalten.
- **Migration der alten Konfigurationsdatei:** Die bisherige JSON-Konfiguration wird einmalig in das neue Konfigurationsmodell übernommen. Erst nachdem die Migration erfolgreich abgeschlossen und die migrierten Einstellungen dauerhaft übernommen wurden, wird die alte Datei gelöscht. Bei einem Fehler darf sie nicht gelöscht werden, damit kein Konfigurationsverlust entsteht.

## Vorgeschlagene Komponenten

```text
src/
  main.ts
  lib/
	base.ts
	types.ts
	config-validator.ts
	minmax-controller.ts
	minmax-tracker.ts
	minmax-state-store.ts
	boundary-scheduler.ts
```

Die Dateiaufteilung ist ein Architekturvorschlag und kann bei der Umsetzung angepasst werden, solange Verantwortlichkeiten und Verhalten erhalten bleiben.

- **Adapterklasse (`main.ts`):** Verantwortlich für ioBroker-Lifecycle und Ereignisse (`ready`, `objectChange`, `stateChange`, `unload`). Liest beim Start aktivierte Objektkonfigurationen unter dem instanzspezifischen Namespace und koordiniert Initialisierung sowie Abonnements.
- **`ConfigValidator`:** Prüft die Custom-Konfiguration, den numerischen Typ des Quellobjekts und die Eindeutigkeit des `logName` innerhalb der Instanz.
- **`MinMaxController`:** Verwaltet die aktiven Tracker nach Quell-OID, verarbeitet Aktivierung, Deaktivierung und Konfigurationsänderungen und verteilt Messwerte sowie Grenzereignisse.
- **`MinMaxTracker`:** Kapselt die fachliche Logik und Konfiguration eines überwachten Datenpunkts. Die Min-/Max- und Differenzberechnung soll möglichst unabhängig von ioBroker-I/O testbar sein.
- **`BoundaryScheduler`:** Plant Cron-Ereignisse anhand der konfigurierten Zeitzone und benachrichtigt den Controller bei Kalenderwechseln. Beim Entladen des Adapters werden Cron-Jobs beendet. Falls das bisherige Cron-Verhalten nicht verfügbar oder nicht wiederverwendbar ist, kann die Grenzenerkennung neu implementiert werden.
- **`MinMaxStateStore`:** Kapselt das Anlegen, Aktualisieren, Übertragen und Löschen der vom Adapter verwalteten ioBroker-Ausgabeobjekte und -zustände. Hier wird die Kompatibilität mit den bestehenden IDs und Datentypen sichergestellt.
- **`base.ts`:** Kann für allgemeine Adapter-Hilfsfunktionen weiterverwendet werden. Die Fachlogik soll jedoch nicht unnötig an eine Adapter-Basisklasse oder direkt an ioBroker-API-Aufrufe gekoppelt werden.
- **Typen (`types.ts`):** Definieren insbesondere die Custom-Konfiguration und die Tracker-/Periodeninformationen explizit. Für die Differenzoption ist die Schreibweise `calcDiff` konsistent zu verwenden.

## Kompatibilität

Bestehende Ausgabe-IDs, Werte und Formate sollen nach Möglichkeit erhalten bleiben. Dazu gehören unter anderem:

- `TodayMin`, `TodayMax`, `TodayMinTime`, `TodayMaxTime`
- `MonthMin`, `MonthMax`, `MonthMinDate`, `MonthMaxDate`
- `YearMin`, `YearMax`, `YearMinDate`, `YearMaxDate`
- optional `TodayDiff`, `MonthDiff`, `YearDiff`

Vor der Implementierung müssen die tatsächlich produktiv verwendeten Objekttypen, Rollen, Datentypen und Formate gegen die alte Implementierung und bestehende Installationen geprüft werden. Falls eine notwendige Änderung nicht kompatibel umgesetzt werden kann, muss der Benutzer vorab darauf hingewiesen werden.

## Noch offene Umsetzungsentscheidungen

1. **Periodenerkennung bei Bestandsdaten:** Vor der Implementierung ist anhand der vorhandenen Zeit-/Datums-Datenpunkte zu prüfen, ob die Periodenzugehörigkeit zuverlässig erkannt werden kann. Insbesondere enthalten die Tagesfelder nur eine Uhrzeit und Extremzeitpunkte kennzeichnen nicht zwingend den letzten Periodenwechsel. Falls die vorhandenen Daten nicht ausreichen, werden Periodenkennungen in einer adapterlokalen JSON-Datei im ioBroker-Datenverzeichnis gespeichert.
2. **Cron-Bibliothek und Altverhalten:** `cron` ist als Abhängigkeit vorhanden. In der sichtbaren alten `main.js` werden `CronCreate`, `CronStatus` und `CronStop` aufgerufen, sind dort jedoch nicht definiert. Das tatsächliche bisherige Cron-Verhalten ist vor der Umsetzung zu prüfen; falls nötig, wird die Cron-Funktion neu implementiert.
3. **Fehlerprotokollierung:** Der genaue Zeitpunkt und die Häufigkeit des `wrong configuration`-Logs bei einem nichtnumerischen Objekttyp sind beim Implementieren konsistent festzulegen; Laufzeitwerte, die nicht numerisch sind, bleiben ohne Berechnung.
