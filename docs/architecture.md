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

`common.custom` ist nach dem Umstieg die maßgebliche und für den Benutzer sichtbare Quelle für `enabled`, `logName` und `calcDiff`. Die ausgelieferte alte Implementierung speichert zusätzlich eine Liste überwachter Datenpunkte in einer JSON-Datei. Diese Alt-Konfiguration wird einmalig in die Custom-Einstellungen der passenden Quellobjekte migriert. Bei widersprüchlichen Werten haben bereits vorhandene Einstellungen in `common.custom[this.namespace]` Vorrang; Werte aus der Legacy-Datei ergänzen nur fehlende Einträge beziehungsweise Felder. Die Altdatei darf erst nach Abschluss des Migrationsversuchs gelöscht werden. Die Legacy-Datei enthält keine Adapterinstanzkennung und ist daher nicht instanzsicher. Ihr tatsächlicher Pfad wird aus `__dirname` relativ zum alten Einstiegspunkt im Adapterverzeichnis gebildet (`../../iobroker-data/minmax/minmax.json`). Bei mehreren Instanzen kann die Datei nicht allein darüber einer Instanz zugeordnet werden; vorhandene instanzspezifische `common.custom`-Einstellungen müssen zur Zuordnung herangezogen werden. Nicht eindeutig zuordenbare Einträge werden verworfen und im Log klar als mögliche Konfigurationsverluste gemeldet; der Benutzer wird aufgefordert, die aktivierten Datenpunkte und deren Custom-Einstellungen sorgfältig zu prüfen. Eine manuelle Bearbeitung der für ihn nicht sichtbaren Legacy-JSON wird nicht verlangt. Die alte Datei ist nicht instanzisoliert und kann durch mehrere Instanzen überschrieben worden sein; das Risiko eines Verlusts zusätzlicher alter Einträge wird als gering eingeschätzt. Die neue Implementierung darf den alten relativen Pfad nicht unbesehen aus `build/main.js` verwenden, da sich dadurch der aufgelöste Pfad verschiebt.

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

Zu jedem Extremwert gibt es einen zugehörigen Zeit- oder Datums-Datenpunkt. Die Tagesfelder (`TodayMinTime`, `TodayMaxTime`) enthalten nur die Uhrzeit; Monats- und Jahresfelder enthalten ein formatiertes Datum. Zusätzlich besitzt jeder gespeicherte ioBroker-Zustand einen Controller-Zeitstempel (`ts`), der den Zeitpunkt der letzten Aktualisierung des jeweiligen Extremwerts abbilden sollte. Bei Reaktivierung oder Start soll vorrangig dieser Epoch-Zeitstempel in der konfigurierten Adapter-Zeitzone ausgewertet werden, um die Periodenzugehörigkeit festzustellen. Vor der Implementierung ist zu verifizieren, dass die vorhandenen ioBroker-State-Abfragen diese `ts`-Werte für Bestandsdaten zuverlässig liefern. Nur falls das nicht gewährleistet ist, werden Periodenkennungen in einer adapterlokalen JSON-Datei im ioBroker-Datenverzeichnis gespeichert. Zusätzliche sichtbare Statistik-Datenpunkte sollen dafür nicht angelegt werden.

## Änderungen an der Konfiguration

- **`logName` geändert:** Die aktuellen Adapter-Ausgabewerte und -objekte sollen möglichst auf die IDs des neuen Namens übertragen werden. Anschließend können die alten Adapter-Ausgabeobjekte entfernt werden. Externe History-Daten, die unter den alten IDs gespeichert wurden, lassen sich dabei möglicherweise nicht übertragen und verbleiben dann dort.
- **`calcDiff` ausgeschaltet:** Die Differenzberechnung wird beendet und die zugehörigen Differenz-Datenpunkte (`TodayDiff`, `MonthDiff`, `YearDiff`) werden entfernt.
- **Datenpunkt deaktiviert:** Im Unterschied zum Abschalten von `calcDiff` bleiben die vorhandenen Min-/Max-Ausgabeobjekte und deren Werte erhalten.
- **Migration der alten Konfigurationsdatei:** Die bisherige JSON-Konfiguration wird einmalig in das neue Konfigurationsmodell übernommen. Vorhandene `common.custom[this.namespace]`-Werte haben Vorrang. Nicht eindeutig zuordenbare Legacy-Einträge werden verworfen und im Log mit einer Aufforderung zur Prüfung der sichtbaren Einstellungen gemeldet; eine manuelle Bearbeitung der JSON-Datei wird nicht verlangt. Nach abgeschlossenem Migrationsversuch wird die Legacy-Datei gelöscht. Bei einem technischen Fehler, der eine verlässliche Verarbeitung verhindert (zum Beispiel Datei kann nicht gelesen werden oder Custom-Einstellungen können nicht dauerhaft geschrieben werden), bleibt sie erhalten.

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

## Ergebnisse aus Phase 1

- `package.json` verweist auf `build/main.js`, aber für die Neuentwicklung ist ausschließlich der aktuelle TypeScript-Quellstand unter `src` maßgeblich. `src/main.ts` enthält derzeit nur das Adapter-Grundgerüst. Die vorhandene Build-Ausgabe ist ausdrücklich nicht als aktuelle Implementierung zu behandeln.
- Die Adapter-Zeitzone ist in `admin/jsonConfig.json5` und `io-package.json` vorgesehen; der TypeScript-Typ `ioBroker.AdapterConfig` ergänzt `timezone` in `src/lib/adapter-config.d.ts`.
- `admin/jsonCustom.json` definiert `logName` und `calcDiff`. Die Objektkonfiguration muss zur Laufzeit unter `common.custom[this.namespace]` gelesen werden.
- Die alte `main.js` verwaltet eine `myObjects`-Liste mit `id`, `name`, `enabled` und `calcDiff`. Speicherort, Format und Cron-Verhalten der ausgelieferten Altversion sind nach Wiederherstellung der Datei im Abschnitt unten dokumentiert.
- Die alten Ausgabeobjekte verwenden die Namen `TodayMin`, `TodayMax`, `TodayMinTime`, `TodayMaxTime`, `MonthMin`, `MonthMax`, `MonthMinDate`, `MonthMaxDate`, `YearMin`, `YearMax`, `YearMinDate`, `YearMaxDate` und optional die drei `*Diff`-States. Die Ausgabe-States werden als lesbar, nicht schreibbar, mit Rolle `value` und dem ermittelten Quellwerttyp angelegt; Zeit-/Datumswerte sind Strings. Die Zeitwerte nutzen `HH:mm:ss`, Datumswerte das formatierte Muster `d MMM yyyy HH:mm:ss` mit englischen Monatskürzeln. Die alte Formatierung verwendet die lokale Host-Zeitzone.
- Der `ts`-Zeitstempel der vorhandenen Min-/Max-State-Daten ist der bevorzugte Kandidat, um bei Reaktivierung die Periodenzugehörigkeit zu bestimmen. Tages-Zeit-States allein reichen nicht, weil sie nur Uhrzeit enthalten. Der konkrete Zugriff auf `ts` und die Zeitzonenumrechnung müssen bei der Implementierung getestet werden. Nur falls diese State-Metadaten nicht verlässlich verfügbar sind, ist die zusätzlich persistierte adapterlokale JSON-Datei erforderlich.
- Die ausgelieferte alte `main.js` enthält Cron-Funktionen. `CronCreate` startet einen täglichen Cronjob um Mitternacht in `adapter.config.timezone` (Standard `Europe/Berlin`). `ResetValues` liest für alle in `myObjects` gespeicherten Datenpunkte den aktuellen Quellzustand und berechnet die Statistiken neu. `CronStop` stoppt alle Jobs beim Entladen. Die Cron-Grenze folgt der Adapter-Zeitzone; die bestehende `CheckReset`-Berechnung verwendet dagegen die lokale Zeitzone des Hostprozesses. Der neue Scheduler muss beide Seiten konsistent auf die Adapter-Zeitzone ausrichten.
- Die alte Konfigurationsdatei heißt `minmax.json` und liegt unter dem aus `__dirname` gebildeten Pfad `../../iobroker-data/minmax/minmax.json`. Das JSON-Format ist `{ "myObjects": [...] }`; Einträge enthalten `id`, `name`, `enabled` und `calcDiff`. `ReadSetup` lädt die Liste beim Start und protokolliert einen fehlenden oder unlesbaren Stand als Warnung. `SaveSetup` schreibt die Liste bei Änderungen und beim Entladen synchron in die Datei. Die Datei wird von der ausgelieferten Version nicht gelöscht.
Eine echte Altdatei liegt nicht im Quellrepository, da sie erst zur Laufzeit im ioBroker-Datenverzeichnis entsteht. Die Migration muss Einträge validieren, passende Quellobjekte laden und vorhandene instanzspezifische Custom-Einstellungen beachten. Nicht eindeutig zuordenbare Einträge werden verworfen, mit einer klaren Warnung im Adapterlog gemeldet und führen nicht dazu, dass die Migration manuelle Bearbeitung der Legacy-Datei verlangt. Nach Abschluss des Migrationsversuchs wird die alte Datei entfernt. Das Log fordert den Benutzer auf, die in Admin sichtbaren aktivierten Datenpunkte und deren Einstellungen sorgfältig zu überprüfen.

## Noch offene Umsetzungsentscheidungen

1. **Fehlerprotokollierung:**
