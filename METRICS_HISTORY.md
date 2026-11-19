# CPU-/RAM-Verlauf

Ab v1.4.321 startet der normale API-Dienst einen eigenen Mess-Thread.
Keine offenen Browser, Cronjobs, externen Analysedienste oder zusätzlichen
Python-Pakete erforderlich. Kein Deployment durch den Assistenten: Erst nach
dem manuellen `./deploy.sh` und API-Neustart beginnt die Aufzeichnung.
Historische Werte vor dieser Aktivierung lassen sich nicht nachträglich erzeugen.

## Messung und Speicherung

- Alle 30 Sekunden, dauerhaft laufend. Aufbewahrung 30 Tage, automatische Bereinigung.
- Separate SQLite unter `.private/system-metrics.sqlite3`, Dateirechte 0600,
  nicht im Git-Repository. Über `METRICS_HISTORY_PATH` kann ein anderer geschützter
  Pfad direkt unter einem `.private`-Verzeichnis gesetzt werden. Eine Datei mit
  anderen Tabellen (App/Auth) wird abgewiesen.
- Ein Serverneustart erhält die Datei. Unterbrechungen werden nicht als Nullwerte
  oder durchgehende Kurven ausgegeben.
- CPU bevorzugt aus Cgroup-v2-CPU-Zeitdifferenzen, normalisiert auf CPU-Quota/
  Affinität. Sonst `/proc/stat`. Erster Messwert bzw. Zählerreset: CPU unbekannt.
- RAM bevorzugt `memory.current`/`memory.max`; ohne endliche Cgroup-Grenze
  `MemTotal - MemAvailable` aus `/proc/meminfo`.
- Cgroup-RAM enthält Cache. Die alten Live-Karten und der Verlauf können deshalb
  unterschiedliche Bezugsgrößen haben. Bei `/proc` hängt die Isolation vom
  LXC-/lxcfs-Setup ab. Es ist keine Messung der Smartphone-Leistung.
- Die CPU-Spitze im Bericht ist der höchste gespeicherte Intervallmittelwert,
  nicht die höchste Last innerhalb einer einzelnen Sekunde. Keine Echtzeitgarantie.
- Nur Zeit, CPU, RAM und Messquelle: keine Besucher-, Standort- oder Nutzerdaten.

## Auswertung

Im Adminbereich unter Systemstatus „CPU & RAM · 3-Stunden-Verlauf“ öffnen.
Seit v1.4.322 umfasst jede Ansicht genau drei Stunden. Frei wählbarer Beginn in
der Browser-Zeitzone; „Veranstaltungsbeginn“ wählt die ersten drei Stunden ab
dem konfigurierten Start. „3 Stunden zurück/weiter“ blättert durch die komplette
Aufzeichnung, auch über Mitternacht. Daten anderer Fenster bleiben gespeichert.
Nach der Veranstaltung bleibt die Aufzeichnung bis zur Bereinigung abrufbar.

Diagramm mit Prozentachse, CPU-Mittel/Maximum und RAM-Maximum. Auf schmalen Geräten
ist das Diagramm horizontal scrollbar. CSV speichert UTC-Zeitstempel sowie
Prozentwerte, RAM-Bytes und Messquellen. Es ist kein Gesamtsystem-Backup.

`GET /api/system-metrics/history?start=<Unix-Millisekunden>` ist ausschließlich
für Admins zugänglich. Der Zeitraum ist fest auf drei Stunden begrenzt, maximal
360 Messpunkte. Diagramm, Kennzahlen und CSV beziehen sich jeweils auf dieses
Fenster. Messdatei und Modul sind durch die Apache-/Python-Regeln geschützt.

## Betrieb

Bei fehlenden Messwerten: ausgewählten Zeitraum, API-Dienst und geschützten
Dateipfad/Schreibrechte prüfen. Der Dienst protokolliert Speicherfehler mit
„Systemverlauf: Messwert konnte nicht gespeichert werden.“ und versucht erneut.
Die Besucher-App soll durch fehlgeschlagene Telemetrie nicht ausfallen.
Für langfristige Archivierung den gewünschten Veranstaltungszeitraum als CSV
herunterladen, bevor die 30-Tage-Frist abläuft. Eine andere Dateiablage bei
Servermigration ebenfalls sichern; nicht automatisch Bestandteil des App-JSON-Backups.
