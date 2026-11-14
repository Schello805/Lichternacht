# Sicherheit & Betrieb

## Maßgeblicher Modus

Die Produktion verwendet App-SQLite und eine separate Local-Auth-SQLite.
Firebase bleibt als historische Kompatibilitätsanbindung im Code, ist aber
im aktivierten lokalen Modus nicht der Produktions-Daten- oder Anmeldedienst.

**Nicht die alte `firestore.rules` veröffentlichen.** Die damalige Schreibsperre
für alte Clients muss erhalten bleiben. Firebase App Check ist keine Absicherung
der lokalen API und keine Voraussetzung für diesen Betriebsmodus.
Migrationsgeschichte: [LOCAL_DATABASE.md](LOCAL_DATABASE.md),
[AUTH_MIGRATION.md](AUTH_MIGRATION.md).

## Vor einem Einsatz prüfen

- Apache/HTTPS als öffentlicher Einstieg; statische Dateien direkt ausliefern,
  ausschließlich `/api/` an den auf Loopback gebundenen API-Dienst weitergeben.
- Aktive Proxy-Konfiguration mit den Vorlagen vergleichen. Die Vorlage allein
  beweist nicht, welche Konfiguration der produktive Apache tatsächlich nutzt.
- Python `http.server` ist kein allgemein empfohlener Produktionsserver.
  Der bestehende API-Betrieb hinter Apache benötigt Überwachung und einen
  realistischen Kapazitätstest; Backlog 128 ist keine Kapazitätsgarantie.
- Daten- und Auth-Datenbanken getrennt, geschützt und mit minimal erforderlichen
  Dateirechten betreiben. Private Backups, `.env`, `.private/`, `.git/`, Logs
  und Server-/Deployment-Dateien dürfen öffentlich nur 403/404 liefern.
- `LOCAL_AUTH_ORIGIN` exakt setzen. Sichere HttpOnly-/SameSite-Cookies,
  unautorisierte Schreibzugriffe und Origin-Abweisung nach einem Update prüfen.
- Admin-Konten gezielt vergeben. Keine Zugangsdaten in Chat, Git oder Browserkonfiguration.
- SMTP-/Admin-Passwörter bei möglicher Offenlegung ändern; Geheimnisse nur auf dem Server.
- `TRUST_PROXY_HEADERS` nur mit nachweislich überschriebenem/bereinigtem
  `X-Forwarded-For` aktivieren. Ungeprüfte Werte erlauben das Umgehen von Limits.
- Geschützte Logs und freien Speicher überwachen; Fehlerprotokolle nicht öffentlich teilen.
- Backup **und Wiederherstellung** testen; zusätzliche Kopie außerhalb des LXC vorhalten.
- Optionale Analyse/Stationsstatistik nur mit Einwilligung. Schriften werden
  lokal ausgeliefert; Karten, Routing und freiwillige Analyse bleiben getrennte
  externe Dienste mit eigenen Datenflüssen.
- Routing-Kapazität und Nutzungsbedingungen separat prüfen; Browser-Caches
  sichern keine gemeinsame Kapazität für viele Besucher zu. Siehe [ROUTING.md](ROUTING.md).

## Check-ins und Aussagegrenzen

Der lokale Server erzwingt Zeitfenster und eindeutige Nutzer-/Stationspaare,
schützt fremde Datensätze und berechnet zentrale Fortschritte/Zähler.
Normale Check-ins sind von einer Stunde vor Beginn bis drei Stunden nach Ende
möglich. Neue Offline-Einträge müssen noch innerhalb des Fensters beim Server
ankommen; nicht übertragbare Einträge können lokal sichtbar bleiben.
Rücknahmen gehören dem ursprünglichen Besitzer und sind auch später zulässig.

GPS, Browserzustand und zufällige Besucherkennungen sind kein manipulationssicherer
Anwesenheits- oder Personennachweis. Auch API-Authentifizierung beweist keinen
physischen Standort. Besuchszahlen beschreiben teilnehmende Browser/Signale,
nicht eine vollständige Personenzählung. Verbindliche Preisentscheidungen
benötigen einen entsprechend geprüften Betreiberprozess.

## Prüfungen und Betrieb

`npm run verify` prüft Versionen, Build, Syntax, Python- und JavaScript-Tests.
GitHub-CI führt zusätzlich Playwright für Smartphone und Desktop aus.
Der lokale Kapazitätstest ist in [LOAD_TEST.md](LOAD_TEST.md) beschrieben.
Diese Prüfungen ersetzen weder einen unabhängigen Sicherheitsaudit noch einen
Lasttest der tatsächlichen Apache-/LXC-/Netzwerkumgebung.

Nach einem Deployment manuell prüfen:

1. Version und Service-Worker-Update; alte Worker werden über `sw.js` abgemeldet.
2. Besucher: Station/Programm, Route, Check-in und Offline-Synchronisation.
3. Admin: Login, Bearbeiten, Import/Export und Backup-Zugriff.
4. Datenschutz: Ablehnung funktioniert, optionale Erfassung bleibt aus.
5. Nicht angemeldet: private Sammlungen, Admin-API und Backups bleiben gesperrt.
6. SMTP-Testmail und Feedback; Clientfehler ohne sensible Inhalte protokolliert.

## Änderungen nach der Veranstaltung

Große UI-/Admin-/Serverdateien schrittweise zerlegen und Inline-Handler abbauen.
Den Python-HTTP-Unterbau geplant durch einen geeigneten Produktions-Stack
ersetzen, statt kurz vor dem Event einen ungetesteten Komplettumbau auszurollen.

Referenz: https://docs.python.org/3/library/http.server.html#module-http.server
