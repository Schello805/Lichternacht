# Vorbereitung einer Server-Datenbank

Der erste Schritt ist eine isolierte SQLite-Datenbank aus einer vorhandenen
Komplettsicherung. Stationen, Events, Einstellungen und eingebettete Dateien
werden erhalten und durch einen vollständigen Rückvergleich geprüft.

Auf dem Server nur in einem geschützten Verzeichnis ausführen:

```bash
python3 scripts/prepare-local-db.py /sicherer/pfad/komplettsicherung.json .private/migration-test.sqlite3
```

Das Skript überschreibt keine vorhandene Datenbank und verändert Firebase nicht.
Die Datenbankdatei erhält Rechte `0600`. Eine Sicherung aus dem Browser kann
veraltete Daten enthalten; vor der Umschaltung ist ein aktueller Abgleich mit
Firebase nötig. Die heutige Komplettsicherung umfasst keine Firebase-Auth-Konten
und keinen vollständigen Export von Check-ins oder Auditlogs.

## Vor einer produktiven Umschaltung

1. Aktuelle Daten vollständig exportieren, inklusive Check-ins und benötigter Logs.
2. Server-API für Lesen und Admin-Schreibzugriffe mit Berechtigungen implementieren.
3. Check-ins, Favoriten, Offline-Synchronisation und Preisberechtigung abstimmen.
4. Firebase-Anmeldung zunächst weiterverwenden oder eine getrennt getestete
   Anmeldung einschließlich Passwortzurücksetzung bereitstellen.
5. Import, Dateien, automatisierte Backups und Wiederherstellung testen.
6. Schreibzugriffe während des finalen Abgleichs kurz sperren und auf die neue
   API umstellen. Einen geprüften Rückweg mit Datenabgleich bereithalten.

Die Testdatenbank wird noch nicht von der App verwendet. Während des
Parallelbetriebs bleibt Firebase die maßgebliche Datenquelle.
