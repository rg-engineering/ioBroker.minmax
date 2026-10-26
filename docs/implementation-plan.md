# Implementierungsplan: TypeScript-Redesign

Dieser Phasenplan beschreibt die schrittweise Umsetzung des TypeScript-Redesigns für den ioBroker-Adapter `minmax`. Die fachlichen Anforderungen und der Architekturentwurf stehen in [`architecture.md`](architecture.md).

## Verbindliche Ausgangslage

- Der Einstiegspunkt in `package.json` ist `build/main.js`.
- `build` enthält derzeit keine verlässliche Grundlage: Es wurde noch nicht aus dem aktuellen Quellstand gebaut beziehungsweise enthält eine andere, nicht mehr verwendete Version.
- Maßgeblich für die Neuentwicklung ist daher der aktuelle TypeScript-Quellstand unter `src`. Vorhandene Build-Dateien werden nicht als Spezifikation oder Referenz für die neue Implementierung behandelt.
- Die alte Implementierung `main.js` im Projektstamm und die vorhandenen Installationsdaten dienen dazu, bestehendes Verhalten, Datenpunktkompatibilität und Migrationsbedarf zu ermitteln.
- Die Arbeit erfolgt phasenweise. Vor der fachlichen Implementierung wird Phase 1 abgeschlossen, damit Migrations- und Kompatibilitätsrisiken bekannt sind.

## Phase 1: Bestand und Kompatibilität klären

**Ziel:** Eine verlässliche Bestandsaufnahme für Datenmigration, Ausgabe-Kompatibilität und Implementierungsumfang erstellen.

**Arbeitsschritte:**

1. Aktuellen TypeScript-Quellstand, Adapterkonfiguration und Admin-Custom-Einstellungen untersuchen.
2. Alte JSON-Konfigurationsspeicherung lokalisieren und Format, Pfad, Instanzverhalten sowie Fehler-/Erststartverhalten dokumentieren.
3. Bestehende Datenpunkt-IDs, Objekttypen, Rollen, Datentypen und Zeit-/Datumsformate der alten Implementierung erfassen.
4. Prüfen, ob vorhandene Extremzeitpunkte die Zugehörigkeit zu Tag, Monat und Jahr ausreichend erkennen lassen. Für Tageswerte berücksichtigen, dass die Felder derzeit nur eine Uhrzeit enthalten.
5. Auswirkungen von Mehrfachinstanzen, `common.custom[this.namespace]`, doppelten `logName`s, Deaktivierung, Reaktivierung und Namensänderungen auf die Datenhaltung festhalten.
6. Ergebnisse und konkrete Implementierungsvoraussetzungen in der Architektur-Dokumentation ergänzen.

**Abnahmekriterien:**

- Der aktuelle Quellstand und alle relevanten Konfigurationsflächen sind identifiziert.
- Ort, Format und Migrationsweg der alten JSON-Konfiguration sind anhand der ausgelieferten `main.js` beschrieben; fehlende Informationen sind ausdrücklich benannt.
- Der Kompatibilitätsumfang der vom Adapter erzeugten Datenpunkte ist dokumentiert.
- Es ist begründet entschieden, ob Periodenmetadaten zusätzlich gespeichert werden müssen oder ob vorhandene Datums-/Zeitwerte ausreichen.
- Es sind keine Implementierungsdateien verändert.

**Ergebnisse der Bestandsaufnahme (2026-10-26):**

- `package.json` zeigt auf `build/main.js`; für die Neuentwicklung ist `src` maßgeblich. `src/main.ts` enthält derzeit nur das Adapter-Grundgerüst. `build` ist kein gültiger Verhaltensstand.
- Zeitzone ist in `admin/jsonConfig.json5`, `io-package.json` und dem global augmentierten `ioBroker.AdapterConfig` vorgesehen.
- `admin/jsonCustom.json` enthält `logName` und `calcDiff`; Instanzkonfiguration muss über `common.custom[this.namespace]` laufen.
- Die wiederhergestellte ausgelieferte `main.js` enthält `ReadSetup`, `SaveSetup` und die Cron-Funktionen. Die Legacy-Konfiguration liegt unter `path.normalize(__dirname + "/../../" + "iobroker-data/minmax/") + "minmax.json"` im JSON-Format `{ "myObjects": [...] }`; Einträge halten `id`, `name`, `enabled` und `calcDiff`. Die Datei wird beim Start gelesen, bei Objektänderungen und beim Entladen geschrieben und von der Altversion nicht gelöscht. Da sie ein Laufzeitdatum ist, befindet sie sich nicht im Repository; die neue Implementierung kann sie beim Adapterstart am hergeleiteten ioBroker-Datenpfad migrieren. Bei einer Migration haben bestehende sichtbare Werte in `common.custom[this.namespace]` Vorrang; Legacy-Werte ergänzen nur fehlende Einstellungen.
- Cron startet täglich um Mitternacht in der konfigurierten Zeitzone und liest die aktuellen Quellen für alle in der gespeicherten Konfiguration enthaltenen Einträge ein. Die alte Reset-Erkennung vergleicht lokale Host-Kalenderfelder, nicht explizit die konfigurierte Zeitzone; diese Inkonsistenz muss im neuen Scheduler behoben werden.
- Bestehende Ausgabe-IDs, Rollen und Formate sind in `architecture.md` dokumentiert. Als Periodenindikator soll zuerst `ts` der gespeicherten Min-/Max-States in der Adapter-Zeitzone geprüft werden. Erst wenn diese Controller-Zeitstempel bei Bestandsdaten nicht zuverlässig nutzbar sind, wird eine zusätzliche adapterlokale JSON-Datei erforderlich.

## Phase 2: Typen und fachliche Berechnung

**Ziel:** Typisierte, testbare fachliche Logik für Minima, Maxima und optionale Differenzen bereitstellen.

**Arbeitsschritte:**

1. Custom-Konfiguration, Tracker-Konfiguration, Messwerte und Periodeninformationen explizit typisieren.
2. Min-/Max-Berechnung pro Tag, Monat und Jahr implementieren; nur numerische Werte zulassen.
3. Optionale Differenzwerte aus den aktuellen Extremwerten ableiten.
4. Tests für Grenzwerte, Periodenwechsel und ungültige Laufzeitwerte hinzufügen.

**Abnahmekriterien:**

- Fachliche Berechnung ist ausreichend von ioBroker-I/O getrennt und gezielt testbar.
- TypeScript-Build und gezielte Tests bestehen.

## Phase 3: Adapterintegration und Konfigurationslebenszyklus

**Ziel:** Fachlogik in den ioBroker-Lifecycle integrieren und Custom-Konfiguration korrekt verwalten.

**Arbeitsschritte:**

1. Aktivierte Objekte dynamisch über `common.custom[this.namespace]` ermitteln; keine Instanz-ID fest codieren.
2. Beim Adapterstart aktuelle Werte gültiger aktivierter Datenpunkte laden.
3. Zustands- und Objektänderungen verarbeiten und Zustandsabonnements verwalten.
4. Nichtnumerische Objektkonfigurationen mit `wrong configuration` protokollieren; nichtnumerische Laufzeitwerte ignorieren.
5. Doppelte `logName`s innerhalb einer Instanz ablehnen, ohne den bereits aktiven Tracker zu beeinträchtigen.
6. Deaktivierung, Reaktivierung, `logName`-Änderung und `calcDiff`-Änderung gemäß Architekturvorgaben behandeln.

**Abnahmekriterien:**

- Jede Adapterinstanz arbeitet ausschließlich mit ihrem eigenen Custom-Namespace.
- Konfigurationsänderungen verändern Abonnements und Tracker nachvollziehbar und ohne doppelte aktive Namen.
- Deaktivierte Ausgabedaten bleiben erhalten; bei Reaktivierung wird die bestehende Statistik korrekt fortgesetzt.

## Phase 4: Kalenderwechsel, Zeitzone und Wiederaufnahme

**Ziel:** Kalenderperioden zuverlässig anhand der konfigurierten Zeitzone verwalten.

**Arbeitsschritte:**

1. Cron-Grenzen für Tag, Monat und Jahr unter Beachtung der Adapter-Zeitzone implementieren oder verlässlich integrieren.
2. Bei jeder relevanten Grenze aktuelle Quellwerte aktiver Datenpunkte lesen und als Min/Max der neuen Periode berücksichtigen.
3. Erkennung verpasster Grenzen bei deaktivierten Trackern und Neustarts integrieren.
4. Falls Phase 1 es erfordert, Periodenmetadaten instanzsicher in einer adapterlokalen JSON-Datei im ioBroker-Datenverzeichnis speichern.
5. Scheduler und persistente Ressourcen beim Entladen zuverlässig beenden beziehungsweise schließen.

**Abnahmekriterien:**

- Tages-, Monats- und Jahreswechsel sind unter der konfigurierten Adapter-Zeitzone korrekt.
- Ein Kalenderwechsel initialisiert neue Werte auch ohne Zustandsänderung.
- Neustart und Reaktivierung nach verpassten Grenzen führen nicht zu Statistiken aus einer abgelaufenen Periode.

## Phase 5: Migration und Abschlussprüfung

**Ziel:** Vorhandene Konfiguration sicher übernehmen und das Redesign gegen Kompatibilitätsanforderungen absichern.

**Arbeitsschritte:**

1. Alte JSON-Konfiguration einmalig in das neue Konfigurationsmodell migrieren.
2. Alte Konfigurationsdatei nur nach erfolgreicher, dauerhaft bestätigter Übernahme löschen; bei Fehlern erhalten.
3. Bestehende Ausgabe-IDs, Datentypen und Datums-/Zeitformate gegen die Phase-1-Bestandsaufnahme verifizieren.
4. Tests, Build und relevante Adapterprüfungen ausführen.
5. Architektur- und Benutzer-Dokumentation aktualisieren; inkompatible Änderungen vorab kenntlich machen.

**Abnahmekriterien:**

- Migration ist wiederholbar und verhindert Datenverlust bei Unterbrechung oder Fehler.
- Build und relevante Tests bestehen.
- Kompatibilitätsprüfungen sind abgeschlossen und verbleibende Abweichungen klar dokumentiert.
