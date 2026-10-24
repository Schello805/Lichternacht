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

## Verfügbare Anbindung

Der Python-Server bietet jetzt `/api/local-data` für Stationen, Events und
Einstellungen. Admin-Änderungen werden über Firebase-ID-Tokens und `ADMIN_EMAILS`
geprüft. Mehrere Änderungen können atomar gespeichert werden. Likes sind pro
Firebase-Nutzer und Station auf eine Bewertung beschränkt.

Die App erkennt diesen Endpunkt, wenn `LOCAL_DATABASE_ENABLED=true` gesetzt ist.
`LOCAL_DATABASE_PATH` muss auf eine bereits importierte Datenbank zeigen. Sie
leitet dann Lesen und Bearbeiten von Stationen, Events und Einstellungen an
SQLite um. Die Datenquelle wird beim Laden gewählt und nicht nachträglich pro
Schreibzugriff gewechselt.

Dieser Hybridbetrieb ersetzt noch nicht alle Firebase-Funktionen: Anmeldung,
Check-ins, Auditlogs, Broadcasts, globale Statistiken und Benutzerverwaltung
bleiben bei Firebase. Lokale Adminrechte stammen aus `ADMIN_EMAILS`.
Gemischte Transaktionen über beide Datenbanken werden abgelehnt. Der Jahresreset
benötigt deshalb noch eine Anpassung. Vor der Freigabe sind komplette
Admin-/Besucherabläufe mit einer aktuellen Sicherung zu testen. Keine Aktivierung
auf dem Live-Server allein durch ein Deployment.

Im Testbetrieb ist SQLite für die drei genannten Datenbereiche maßgeblich.
Es gibt keine automatische Rücksynchronisation nach Firebase. Zurückschalten
erfordert deshalb vorher einen Export und Datenabgleich.
