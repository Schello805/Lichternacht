# Lichternacht Bechhofen – PWA

Web-App für Stationen, Programmpunkte, Fußwege und den Lichter-Pass.
Frontend: Vanilla JavaScript, TailwindCSS und MapLibre. Produktiver Daten- und
Anmeldemodus: Python-API mit SQLite und Local Auth auf dem eigenen Server.

## Aktueller Betrieb

- App-Daten seit v1.4.297, Anmeldung seit v1.4.299 lokal; Einzelheiten:
  [LOCAL_DATABASE.md](LOCAL_DATABASE.md) und [AUTH_MIGRATION.md](AUTH_MIGRATION.md).
- Apache liefert HTML, JavaScript, CSS, Schriften und Downloads direkt aus.
  Nur `/api/` wird an den auf Loopback gebundenen Python-Dienst weitergeleitet.
- Die App prüft die lokale Anmeldung vor dem Laden alter Firebase-Anbindungen.
  Firebase-Dateien sind Migrations-/Kompatibilitätscode, keine Anweisung zum Rückwechsel.
- **Alte `firestore.rules` nicht veröffentlichen und bestehende lokale
  systemd-Drop-ins nicht abschalten.** Ein Rückwechsel braucht einen geprüften Datenabgleich.
- Im lokalen Modus werden Änderungen regelmäßig über die API aktualisiert,
  nicht über Firestore-Realtime.
- Eine erfolgreiche CI ist kein Nachweis für Produktionskapazität oder externe Dienstverfügbarkeit.

## Funktionen und Grenzen

- Stationen, Programmpunkte, WC/Parkplätze und Admin-Bearbeitung.
- Favoriten, Check-ins, freiwillige Statistik und Lichter-Pass.
- Check-in-Fenster: eine Stunde vor Beginn bis drei Stunden nach Ende.
  Maßgeblich ist der konfigurierte Veranstaltungszeitraum und die Serverprüfung.
- Fußwege ab GPS-Standort, offene Tour oder Rundweg; siehe [ROUTING.md](ROUTING.md).
- Offline bleiben bereits zwischengespeicherte Inhalte verfügbar. Kartenausschnitte,
  neue Routen, Feedback und Synchronisation benötigen eine Verbindung.
- Programmerinnerungen benötigen eine geöffnete App. Die Installation allein
  aktiviert keine Hintergrund-Pushzustellung.
- Bilder/PDFs unter `downloads/`; Schriften Lato/Cinzel lokal unter `vendor/fonts/`.
- Feedback über `POST /api/bug-report`, SMTP-Zugangsdaten ausschließlich auf dem Server.

## Serverkonfiguration

Aktivierung und Datenbankpfade liegen in der bestehenden Produktionsinstallation
in systemd-Drop-ins. `deploy.sh` aktiviert diese nicht neu und darf sie nicht ersetzen.
Für eine neue Installation erst die Anleitungen für Datenbank, Anmeldung und
[Apache/SMTP](SERVER_EMAIL_SETUP.md) durcharbeiten; bloßes Klonen reicht nicht.

Wichtige Einstellungen:

- `LOCAL_DATABASE_ENABLED=true`, `LOCAL_DATABASE_PATH`: vorhandene App-Datenbank.
- `LOCAL_AUTH_ENABLED=true`, `LOCAL_AUTH_PATH`: separate Auth-Datenbank unter `.private`.
- `LOCAL_AUTH_ORIGIN`: exakte öffentliche HTTPS-Origin; keine fremden Origins zulassen.
- `BIND_HOST=127.0.0.1`: API nicht unmittelbar öffentlich exponieren.
- SMTP in geschützten Servereinstellungen; keine Passwörter in `config.js`.
- `TRUST_PROXY_HEADERS` nur mit nachweislich bereinigten Proxy-Headern aktivieren.

Im lokalen Produktivmodus ist kein Firebase-Schlüssel für den Login erforderlich.
Die optionale öffentliche `config.js` kann die App-ID enthalten; sie ist **kein**
Speicherort für SMTP-, Datenbank- oder Admin-Zugangsdaten.
Admin-Konten verwaltet die lokale Anmeldung. Wiederherstellung/Bootstrap erfolgt
über die in `AUTH_MIGRATION.md` dokumentierte Terminal-CLI, nicht durch alte Firestore-Einträge.

## Releases und Server-Update

Änderungen gehen über Pull Request, Versionsabgleich, `npm run verify` und
erfolgreiche GitHub-CI nach `main`. Danach wird ein passender Release-Tag erstellt.
Der Betreiber aktualisiert den Server selbst:

```sh
cd /var/www/html/Lichternacht
./deploy.sh
```

Optional: `./deploy.sh vX.Y.Z` für einen **vorher geprüften, mit dem aktuellen
Datenbank-/Auth-Modus kompatiblen** Release. Das Skript holt Tags, wählt den
neuesten Versions-Tag, setzt den Codestand, kopiert die Apache-Vorlage und startet
den API-Dienst neu. Es prüft selbst keine CI-Ergebnisse.
Nicht unkontrolliert auf einen Stand vor der lokalen Migration zurücksetzen.

## Sicherung und Wiederherstellung

- Öffentliche Veranstaltungsdaten und Dateien sowie lokale Dokumente/Likes können
  im Adminbereich als Komplett-JSON gesichert werden.
- Dieses JSON ist vertraulich, aber **keine vollständige Systemsicherung**:
  Auth-Passworthashes, Sitzungen und SMTP-Geheimnisse gehören nicht hinein.
- Restore lokaler Komplettsicherungen: geprüftes Importskript in eine neue
  Datenbank, nicht der alte Browser-Import.
- Die geschützte Serversicherung umfasst zusätzlich Auth-Datenbank, Uploads und
  Betriebskonfiguration. Sitzungen/Resetlinks werden bewusst nicht wiederbelebt.
- Auch eine externe Sicherung des LXC/Backups vorhalten. Eine Datei auf demselben
  Server schützt nicht vor dessen Verlust.
- Vorgehen: [LOCAL_DATABASE.md](LOCAL_DATABASE.md), [AUTH_MIGRATION.md](AUTH_MIGRATION.md).

## Entwicklung und Prüfungen

```sh
npm ci
npm run version:sync
npm run verify
npm run test:e2e
```

CSS: `npm run watch` oder `npm run build`; Ausgabe `dist/output.css`.
Der Python-Server dient lokal auch statische Dateien aus, produktiv übernimmt das Apache.
Geschützte Dateien und Logs nicht ins Web ausliefern; siehe [SECURITY.md](SECURITY.md).
Begrenzter, ausschließlich lokaler Lasttest: [LOAD_TEST.md](LOAD_TEST.md).

## Projektübersicht

- `index.html`, `main.js`, `js/ui.js`: Oberfläche und Interaktionen.
- `js/maplibre-map.js`, `js/foot-routing.js`: Karte und externer Fußwegdienst.
- `server.py`, `local_database.py`, `local_auth.py`: API, Daten, Anmeldung.
- `server-htaccess`, `server/apache/`: Apache-Vorlagen.
- `service-worker.js`: Caching; `sw.js`: bewusste Abmeldung historischer Worker.
- `vendor/`: lokale Laufzeiten, Schriften und zugehörige Lizenzen.
- `tests/`: JavaScript-, Python- und Browserprüfungen.

## Fehlersuche

Zuerst Release-Version, Browser-Konsole und geschützte Server-/Dienstlogs prüfen.
Bei Daten-/Login-Problemen lokale API, systemd-Einstellungen und Datenbankpfade
prüfen – nicht Firebase neu aktivieren. Feedback-/Resetmail-Probleme anhand der
SMTP-Testmail eingrenzen. Vor dem Löschen von Website-Daten daran denken:
Favoriten, Tourplanung und nicht synchronisierte Besuche können verloren gehen.
