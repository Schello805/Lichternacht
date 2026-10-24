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
Firebase nötig. Alte Browser-Sicherungen enthalten keine Check-ins oder Auditlogs.
Der neue Firestore-Export und lokale Komplettsicherungen enthalten diese Daten.
Firebase-Auth-Konten bleiben unabhängig davon bei Firebase Authentication.

## Vor einer produktiven Umschaltung

1. Aktuelle Daten vollständig exportieren, inklusive Check-ins und benötigter Logs.
2. Import und Abgleich aller Datensammlungen und gespeicherten Dateien durchführen.
3. Check-ins, Favoriten, Offline-Synchronisation und Admin-Abläufe testen.
4. Firebase-Anmeldung zunächst weiterverwenden oder eine getrennt getestete
   Anmeldung einschließlich Passwortzurücksetzung bereitstellen.
5. Import, Dateien, automatisierte Backups und Wiederherstellung testen.
6. Schreibzugriffe während des finalen Abgleichs kurz sperren und auf die neue
   API umstellen. Einen geprüften Rückweg mit Datenabgleich bereithalten.

## Verfügbare Anbindung

Der Python-Server bietet `/api/local-data` für Stationen, Events, Einstellungen,
Check-ins, Protokolle, Besucherzahlen, Statistiken, Nachrichten, Berichte und
App-Berechtigungen. Admin-Änderungen werden über Firebase-ID-Tokens und
`ADMIN_EMAILS` oder lokal gespeicherte Berechtigungen geprüft. Mehrere Änderungen
werden atomar gespeichert. Likes sind pro Firebase-Nutzer und Station begrenzt.

Die App erkennt diesen Endpunkt, wenn `LOCAL_DATABASE_ENABLED=true` gesetzt ist.
`LOCAL_DATABASE_PATH` muss auf eine bereits importierte Datenbank zeigen. Sie
leitet dann Lesen und Bearbeiten von Stationen, Events und Einstellungen an
SQLite um. Auch die übrigen App-Daten werden lokal verarbeitet. Die Datenquelle
wird beim Laden gewählt und nicht nachträglich pro
Schreibzugriff gewechselt.

Firebase Authentication bleibt für Anmeldung, anonyme Identität und Passwörter
zuständig. Im lokalen Modus erfolgen App-Datenzugriffe über SQLite statt
Firestore. Broadcasts werden jede Minute aktualisiert. Personenbezogene
Berechtigungen, Check-ins und Protokolle sind nicht öffentlich lesbar.
Der Server erzwingt Check-in-Zeitfenster und eindeutige Nutzer-/Stationspaare;
er berechnet Zähler und Stufen selbst. GPS-Angaben und der lokale Pass auf dem
Endgerät bleiben manipulierbar und sind kein verbindlicher Preisnachweis.
Ein Wechsel auf ein weiteres Veranstaltungsjahr benötigt eine passend
importierte Datenbank mit eigener App-ID.

Im lokalen Betrieb ist SQLite für die App-Daten maßgeblich.
Es gibt keine automatische Rücksynchronisation nach Firebase. Zurückschalten
erfordert deshalb vorher einen Export und Datenabgleich.

## Vollständiger Export und Import

`scripts/export-firestore.mjs` liest alle unterstützten Datensammlungen und
gespeicherten Bilder/PDFs. Es benötigt einen Google-OAuth-Zugriffstoken mit
Leserechten auf das Projekt über `FIREBASE_ACCESS_TOKEN`. Keine Token in Chat,
Dateien oder Shell-Historie ablegen. Fehler brechen den Export ab; eine
vorhandene Ausgabedatei wird nicht überschrieben.

```bash
node scripts/export-firestore.mjs lichternacht-bechhofen-2026 lichternacht-2026 https://lichternacht-bechhofen.de /sicherer/pfad/export.json
python3 scripts/prepare-local-db.py /sicherer/pfad/export.json .private/local.sqlite3 --assets-root /var/www/html/Lichternacht
```

Ein ausgeschöpftes Firestore-Kontingent kann auch den Export blockieren. Dann
keinen Teil-Export aktivieren. Erst einen aktuellen vollständigen Export oder
eine nachweislich vollständige Sicherung verwenden.

Vor dem endgültigen Export Schreibzugriffe alter Clients sperren und laufende
Admin-Änderungen beenden. Nach der Umschaltung dürfen alte App-Versionen nicht
weiter in Firestore schreiben; diese Sperre erst nach einem geprüften
Rückabgleich aufheben. Der Export übernimmt auch globale Admin-Berechtigungen.

Lokale Komplettsicherungen im Adminbereich enthalten zusätzlich `localDocuments`
und `localLikes`. Wiederherstellung über das Importskript in eine neue Datenbank;
der Browser verhindert eine unvollständige Wiederherstellung dieser Sicherungen.
SQLite-Dateien und JSON-Sicherungen nur unter `.private` oder außerhalb des
Web-Verzeichnisses speichern. Der Dienstnutzer benötigt Schreibrechte auf die
Datenbank und deren Verzeichnis. Nach gesetzten Umgebungsvariablen muss der
API-Dienst neu gestartet werden. Ein Deployment allein aktiviert SQLite nicht.
