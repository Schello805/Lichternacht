# Migrations-Anleitung: Lichternacht 2025 -> 2026

Diese Anleitung beschreibt, wie die App sicher auf das nächste Jahr umgestellt wird, ohne Daten zu verlieren.

## 1. Daten sichern (Archivierung 2025)

Bevor irgendetwas am Code geändert wird:

1.  Öffne die App und logge dich als Admin ein.
2.  Öffne das **Admin-Panel** (Klick auf "Export").
3.  Kopiere den gesamten Textinhalt.
4.  Öffne **Excel** (oder Google Sheets) und füge den Inhalt in Zelle `A1` ein.
5.  Speichere diese Datei als `Lichternacht_2025_Final.xlsx`.
    *   ⚠️ **Wichtig:** Diese Datei enthält alle Likes und Besucherzahlen von 2025. Gut aufheben für die Auswertung!

## 2. Daten für 2026 vorbereiten

1.  Erstelle eine Kopie der Excel-Datei und nenne sie `Lichternacht_2026_Setup.xlsx`.
2.  Öffne die Datei.
3.  **Likes zurücksetzen:** Lösche den Inhalt der Spalte `TAGS_COLOR` (bei Events) oder einer spezifischen Like-Spalte, falls exportiert. 
    *   *Hinweis:* Aktuell werden Likes nicht explizit exportiert, um Manipulation zu verhindern. Wenn sie im Export enthalten sind (Spalte `LIKES` o.ä.), setze sie auf 0.
4.  **Aufräumen:**
    *   Lösche Stationen, die 2026 nicht mehr dabei sind.
    *   Füge neue Stationen hinzu.
    *   Passe Beschreibungen und Angebote an.

## 3. App auf 2026 umstellen

Bearbeite die Dateien im Quellcode:

### A. `config.js`
Ändere die App-ID. Das sorgt dafür, dass die App eine **neue, leere Datenbank** verwendet. Die alten Daten bleiben in Firebase unter der alten ID erhalten.

```javascript
// Alt
const __app_id = "lichternacht-2025";

// Neu
const __app_id = "lichternacht-2026";
```

### B. `index.html`
Suche nach "2025" und ersetze es durch "2026".
*   `<title>` Tag
*   Überschriften (`h1`)
*   Footer / Copyright

## 4. Neue Daten importieren

1.  Lade die geänderte App hoch (Deployment).
2.  Öffne die App (sie ist jetzt leer, keine Stationen).
3.  Logge dich als Admin ein.
4.  Öffne das **Admin-Panel**.
5.  Kopiere alle Daten aus deiner `Lichternacht_2026_Setup.xlsx` (inklusive Kopfzeile!).
6.  Füge sie in das Textfeld ein.
7.  Klicke auf **"Importieren (Cloud)"**.

## 5. Fertig! 🚀

Die App ist nun bereit für 2026.
*   Alle Stationen sind eingetragen.
*   Alle Likes stehen auf 0.
*   Die 2025er Daten liegen sicher im Archiv (Excel & Firebase).
