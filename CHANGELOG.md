# Changelog

## [1.0.0] - 2025-11-23 (Initial Release Version)

### Features
- **Modulare Architektur:** Aufteilung von `app.js` in Module (`js/`).
- **Gamification:** Lichter-Pass, Levels (Bronze bis Diamant), Check-ins.
- **Admin-Tools:**
    - JSON Dump & Import.
    - **"Download data.js"** Feature für einfaches Daten-Update.
    - Visuelle Tooltips im Admin-Panel.
- **UI/UX:**
    - Neue Navigation (Karte, Stationen, Programm).
    - "Aktuelles Event" Anzeige im Programm-Tab.
    - Verbesserte Modals und Icons.
- **Sicherheit:**
    - Firestore Security Rules erstellt.
    - Fallback bei CORS/Verbindungsfehlern auf lokale Daten.

### Fixes
- Login-Modal schließt jetzt korrekt nach Login.
- Menü-Navigation (`switchTab`) gefixt (ID-Mismatch behoben).
- "Lade Programm..." Anzeige gefixt.
- Firebase Version auf stable 10.13.1 gesetzt.

### Known Issues
- TailwindCSS via CDN (Performance-Warnung in Konsole, aber funktional).
- Firestore CORS Fehler bei lokaler Entwicklung (durch Fallback abgefangen).
