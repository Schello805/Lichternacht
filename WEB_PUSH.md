# Programmerinnerungen bei geschlossener App

Web Push ist optional und ohne Konfiguration ausgeschaltet. Die reguläre App und
lokale Erinnerungen funktionieren weiterhin. Es wird kein Standort im Hintergrund
erfasst. Besucher aktivieren im Programm ausdrücklich Erinnerungen für alle
Programmpunkte. Auf iPhone/iPad ist die installierte Home-Bildschirm-Web-App nötig.
Browser, Internet, Fokus und Betriebssystem beeinflussen die Zustellung; ein
vollständig beendeter Browser kann die Zustellung ebenfalls verhindern.

## Einmalige Einrichtung auf dem Server

Nach `./deploy.sh v1.4.342` die vorhandene Unit mit
`systemctl cat lichternacht-api` prüfen. Folgendes Beispiel verwendet das bisherige
App-Verzeichnis und eine eigene virtuelle Python-Umgebung. Es ändert keine
bestehenden Auth- oder Datenbankeinstellungen. Diese Einrichtung ist bewusst
nicht Teil des automatischen Deployments.

```sh
cd /var/www/html/Lichternacht
python3 -m venv /opt/lichternacht-push-venv
/opt/lichternacht-push-venv/bin/pip install -r requirements-push.txt
install -d -m 700 /root/lichternacht-push
/opt/lichternacht-push-venv/bin/python scripts/generate-push-vapid.py --private-key /root/lichternacht-push/vapid.pem
```

Der letzte Befehl zeigt nur den öffentlichen Schlüssel und Dateipfad. Er
überschreibt keinen vorhandenen Schlüssel. Den privaten Schlüssel niemals
veröffentlichen oder ins Repository kopieren. Bei einem anderen Service-Benutzer
müssen Pfad und Besitzrechte passend eingerichtet werden; `/root` ist dann nicht
geeignet. Ein dauerhaftes VAPID-Schlüsselpaar verwenden, nicht bei jedem Update
neu erzeugen. Ein Schlüsselwechsel erfordert neue Geräte-Abonnements.

Eine geschützte Datei `/etc/lichternacht-push.env` (Modus 0600) anlegen:

```ini
PROGRAM_PUSH_ENABLED=true
PROGRAM_PUSH_PUBLIC_KEY=HIER_DEN_AUSGEGEBENEN_OEFFENTLICHEN_SCHLUESSEL_EINTRAGEN
PROGRAM_PUSH_PRIVATE_KEY_FILE=/root/lichternacht-push/vapid.pem
PROGRAM_PUSH_DATABASE=/root/lichternacht-push/subscriptions.sqlite3
PROGRAM_PUSH_SUBJECT=mailto:DEINE_OEFFENTLICHE_KONTAKTADRESSE
```

Mit `systemctl edit lichternacht-api` ergänzen; bestehenden WorkingDirectory,
Benutzer und Auth-/Datenbank-Drop-ins beibehalten:

```ini
[Service]
EnvironmentFile=/etc/lichternacht-push.env
ExecStart=
ExecStart=/opt/lichternacht-push-venv/bin/python /var/www/html/Lichternacht/server.py
```

Danach `systemctl daemon-reload && systemctl restart lichternacht-api` und
`journalctl -u lichternacht-api -n 50 --no-pager` prüfen. Der Server startet bei
fehlerhafter Push-Konfiguration weiter, meldet den Push-Dienst aber als nicht
verfügbar. Lokale Anmeldung und lokale Datenbank müssen aktiviert bleiben.
Ausgehendes HTTPS zu den Push-Diensten von Apple, Google, Mozilla bzw. Microsoft
muss erreichbar sein. Keine Ports nach außen zusätzlich öffnen.

## Prüfen und Betrieb

- `/api/program-push/config` zeigt nur Verfügbarkeit und öffentlichen Schlüssel.
- Mit einem zukünftigen Testtermin, freiwilliger Aktivierung und zwei realen
  Geräten prüfen: App schließen, Erinnerung empfangen, Antippen, wieder abmelden.
  Alte Programmpunkte werden nicht rückwirkend versendet. Einwilligungen nach
  dem 15-Minuten-Erinnerungszeitpunkt erzeugen keine nachgeholte Erinnerung.
- Absagen und Terminänderungen werden vor Versand erneut geprüft. Auch die
  Eröffnung vor dem offiziellen Beginn und Programmpunkte am Ende werden erfasst.
- Ein serverseitiger Scheduler läuft unabhängig von geöffneten Browsern. Jobs
  werden persistent, wiederholbar und mit begrenzter Parallelität abgearbeitet.
  Ungültige Abonnements (404/410) werden gelöscht. Versand ist nicht garantiert;
  nach Beginn des Programmpunkts wird keine Erinnerung mehr nachgesendet.
- Abmeldung entfernt Geräte-Abonnement und Serverdaten; bei Netzfehlern wird die
  Serverlöschung beim nächsten App-Aufruf wiederholt. Abonnements laufen spätestens
  24 Stunden nach dem berücksichtigten Programmzeitraum ab; Bereinigung erfolgt
  bei der nächsten Verarbeitung. Die Zustimmung verlängert sich nicht automatisch
  für die nächste Veranstaltung.
- Push-Datenbank und VAPID-Schlüssel zusätzlich in die geschützte Serversicherung
  aufnehmen. SQLite konsistent über dessen Backup-API sichern, nicht eine laufende
  Datenbankdatei blind kopieren. Beide sind absichtlich nicht im öffentlichen
  JSON-Export. Bei Restore alter Sicherungen können bereits widerrufene Abonnements
  enthalten sein; solche Datensätze nicht ungeprüft wieder für den Versand nutzen.

## Andere Nach-Event-Änderungen

Automatisches Einchecken ist im Lichter-Pass freiwillig aktivierbar und gilt nur
für die aktuelle Seitensitzung. Mehr als zwei Minuten kontinuierlich brauchbare
GPS-Messungen innerhalb von 20 Metern sind erforderlich; Ausblenden, Messlücken
und Stationswechsel setzen den Zähler zurück. Keine Garantie für GPS-Genauigkeit.
Programmdauer ist im Editor optional (1–1440 Minuten). Ohne Angabe bleiben die
bisherigen Zeitfenster erhalten. Excel/CSV enthält `durationMinutes`; alte Vorlagen
ohne diese Spalte behalten bestehende Dauern. Eine leere vorhandene Spalte löscht
die Dauer. Google-Maps-Navigation startet zu Fuß; die interne Routenanzeige bleibt
unverändert. Die Uhren-Anbindung übernimmt Google Maps, nicht die Web-App.
