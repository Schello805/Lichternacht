# Sicherheit & Betrieb

Diese App ist eine private PWA mit Firebase/Firestore und einem kleinen Server-Endpunkt für Feedback-Mails.

## Sicherheitsniveau

Die Besucheroberfläche darf öffentliche Veranstaltungsdaten lesen. Schreibzugriffe
für Check-ins, Anwesenheit und Auswertungen sind auf authentifizierte (auch anonyme)
Firebase-Sitzungen sowie ein enges Datenschema begrenzt. Das ersetzt keinen Schutz
gegen automatisierte Zugriffe: Vor dem Event Firebase App Check aktivieren.

## Vor jedem produktiven Einsatz prüfen

- `firestore.rules` deployen und im Firebase-Regel-Simulator testen.
- **Firebase App Check:** Für die Web-App aktivieren, den reCAPTCHA-Enterprise-Schlüssel
  hinterlegen und nach einem kurzen Beobachtungszeitraum die Durchsetzung für
  Firestore und Authentication einschalten.
- Admin-Nutzer nur gezielt in `artifacts/{appId}/public/data/users` anlegen.
- `.env` niemals committen; SMTP-Zugangsdaten nur auf dem Server speichern.
- Admin- und SMTP-Passwörter nur im Passwortmanager ablegen und bei einer möglichen
  Klartextweitergabe sofort ändern.
- `logs/client-errors.log` regelmäßig prüfen und nicht veröffentlichen.
- Apache nur per HTTPS bereitstellen; die Header aus `server-htaccess` aktivieren.
- `TRUST_PROXY_HEADERS=true` nur setzen, wenn der Proxy `X-Forwarded-For` zuverlässig
  selbst befüllt. Andernfalls bleibt der Schutz absichtlich serverweit konservativ.
- Matomo/Tracking nur über Consent aktivieren und Datenschutzhinweise aktuell halten.
- Nach jedem Deployment prüfen: App-Version, Service Worker Update, Admin-Datencheck.

## GitHub Checks

Bei Push/Pull Request läuft `.github/workflows/ci.yml`:

- `npm ci`
- `npm run verify`
- Tailwind-Build
- JavaScript-Syntaxcheck
- Node-Tests für Validierung und Zeitfenster
- Playwright-E2E für Stationsdetails und Admin-Datencheck

## Kritische manuelle Tests

- Besucher: Station öffnen, Route starten, Lichter-Pass Check-in.
- Admin: Datencheck öffnen, Station bearbeiten, CSV exportieren/importieren.
- Offline: App einmal laden, Netzwerk trennen, Karte/Liste öffnen.
- Update: Nach Deployment Update-Hinweis testen und neu laden.
- Sicherheit: Nach dem Rules-Deploy einen anonymen Check-in, einen Like und einen
  Admin-Import testen; unautorisierte Firestore-Schreibversuche müssen abgelehnt werden.
