# Sicherheit & Betrieb

Diese App ist eine private PWA mit Firebase/Firestore und einem kleinen Server-Endpunkt für Feedback-Mails.

## Vor jedem produktiven Einsatz prüfen

- `firestore.rules` deployen und im Firebase-Regel-Simulator testen.
- Admin-Nutzer nur gezielt in `artifacts/{appId}/public/data/users` anlegen.
- `.env` niemals committen; SMTP-Zugangsdaten nur auf dem Server speichern.
- `logs/client-errors.log` regelmäßig prüfen und nicht veröffentlichen.
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
