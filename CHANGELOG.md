# Changelog

## [1.4.55] - 2025-12-30
### Improved
- **UI:** Filter-Trennlinie nochmals verstärkt (Dunkelgrau `bg-gray-400`, 2px Breite), um die Sichtbarkeit sicherzustellen.

## [1.4.54] - 2025-12-30
### Improved
- **UI:** Filter-Trennlinie (Separator) deutlich verstärkt (dicker, höher, mehr Abstand), damit sie auf allen Displays gut sichtbar ist.
- **System:** Bereinigung von alten statischen HTML-Elementen im Ladevorgang.

## [1.4.53] - 2025-12-30
### Improved
- **UI:** Visuelle Trennung (vertikaler Strich) zwischen den Hauptfiltern (Alle, Nähe, Favoriten, Besucht) und den dynamischen Tags (Essen, Trinken, etc.) hinzugefügt.

## [1.4.51] - 2025-12-30
### Fixed
- **Bugfix:** Die Stationsliste zeigt nun sofort nach dem Start die Entfernungen (und Minuten) an, sobald das GPS ein Signal hat. Zuvor wurde die Liste nicht automatisch aktualisiert (im Gegensatz zum Programm).

## [1.4.50] - 2025-12-30
### Added
- **Credits:** Hinweis auf der Hilfeseite hinzugefügt, dass das Projekt von Michael Schellenberger zu 100% mit KI erstellt wurde.

## [1.4.49] - 2025-12-30
### Fixed
- **UI:** Weitere Verbesserung der Abstände für den "BESUCHT"-Stempel. Die ID-Nummer rückt nun weiter nach links, damit sie nicht vom Stempel verdeckt wird.

## [1.4.48] - 2025-12-30
### Fixed
- **UI:** Der "BESUCHT"-Stempel wird nun korrekt rechts oben auf der Karte positioniert und überlappt nicht mehr den Titel. (Fallback für fehlende CSS-Klassen hinzugefügt).

## [1.4.47] - 2025-12-30
### Improved
- **UI:** Umbenennung des Filters "Nähe" zu "in der Nähe" für bessere Verständlichkeit.

## [1.4.46] - 2025-12-30
### Added
- **Feature:** Neuer Filter-Button "Besucht" in der Leiste oben. Damit kannst du nun einfach alle Stationen filtern, bei denen du bereits eingecheckt hast.
- **Fix:** Der Zähler für den Lichter-Pass (Trophäe oben) zeigt beim Start der App nun sofort den korrekten Stand aus dem Speicher an, nicht erst nach dem ersten Check-In.

## [1.4.45] - 2025-12-30
### Improved
- **UI/UX:** Banner-Animationen hinzugefügt (Fade-In/Scale-Up) für ein weicheres Erscheinungsbild. Styling verfeinert (Hover-Effekte, saubere Schriftarten).
- **System:** Komplettes Redesign des produktiven "In Planung"-Overlays, damit es exakt dem Vorschau-Banner entspricht (Entfernung von statischem HTML-Code).

## [1.4.44] - 2025-12-30
### Improved
- **UI:** Design-Update für das "In Planung" Overlay. Modernes, sauberes Design ohne Serif-Schriften, mit korrekt positioniertem Schließen-Button und verbessertem Styling.

## [1.4.43] - 2025-12-30
### Fixed
- **System:** Bereinigung der Modul-Imports in `main.js`. Entfernen der Version-Query-Parameter bei internen Imports, um "Split-Brain"-Probleme (doppelte Modul-Instanzen) zu verhindern. Dies sollte sicherstellen, dass Funktionen wie `testPlanningBanner` korrekt global verfügbar gemacht werden.
- **Admin:** "Banner testen" Button mit Debug-Checks erweitert (`alert` bei fehlender Funktion).

## [1.4.42] - 2025-12-30
### Fixed
- **Admin:** "Banner testen" erzeugt nun ein **dynamisches, neues DOM-Element**, anstatt zu versuchen, das bestehende Overlay einzublenden. Dies umgeht potenzielle CSS/Rendering-Probleme des statischen Elements.

## [1.4.41] - 2025-12-30
### Fixed
- **Admin:** "Banner testen" repariert: Das Banner wird nun im DOM ganz nach unten verschoben und mit Inline-Styles (`!important`, `z-index: 2147483647`) zur Anzeige gezwungen, um Überlagerungsprobleme sicher auszuschließen.

## [1.4.40] - 2025-12-30
### Fixed
- **Admin:** "Banner testen" Funktion erzwingt nun aggressiv die Sichtbarkeit (`display: flex !important`, `z-index: 99999`), falls das Overlay von anderen Elementen überdeckt wurde.

## [1.4.39] - 2025-12-30
### Changed
- **UI:** Admin-Panel Layout verbessert:
    - "Importieren"-Button ist nun weniger dominant (weiß mit rotem Rand).
    - Tooltips erscheinen nun oberhalb der Buttons und verdecken nichts.
    - "Schließen"-Button befindet sich nun ganz unten im Panel.
- **Admin:** Neuer Button **"Banner testen (Vorschau)"** im Planungs-Modus Bereich, um das Popup sofort zu prüfen.
- **System:** Robustere Erkennung des Planungs-Modus (`checkPlanningMode`), um sicherzustellen, dass der Banner erscheint.
- **System:** Version Bump auf 1.4.39 für Cache-Invalidierung.

## [1.4.38] - 2025-12-29
### Changed
- **GPS:** Die App fragt nun sofort beim Start nach dem Standort, damit Entfernungen direkt sichtbar sind.
- **UI:** Entfernungsangaben werden nun auch im **Programm-Tab (Timeline)** angezeigt (sofern Koordinaten vorhanden sind).
- **UI:** Standort-Button ("Fadenkreuz") in Listenansicht wird ausgeblendet, wenn GPS bereits aktiv ist (nur bei Fehler sichtbar).
- **UI:** "Zeigen"-Button im Programm-Tab springt nun direkt zur Station auf der Karte (`flyToStation`).
- **UI:** In der Stationsliste werden besuchte Stationen nun deutlich mit einem **"BESUCHT"**-Badge und grüner Farbe markiert.
- **UI:** Die Anzahl der **Likes** wird nun direkt in der Stationsliste angezeigt (Daumen-Hoch Icon).
- **UI:** Der "Like"-Button im Detail-Fenster ist nun deutlicher beschriftet ("Like") und nutzt ein Daumen-Hoch Icon.
- **Admin:** Neuer Button **"Neues Jahr starten"**: Setzt mit einem Klick alle Likes, Medaillen-Statistiken, Broadcasts und (beim nächsten App-Start) die Besucher-Listen aller Nutzer zurück.
- **Admin:** "Nachricht an alle" (Broadcast) kann nun auch gelöscht werden, um alte Nachrichten zu entfernen.
- **System:** Planungs-Modus Banner wird nun zuverlässiger geladen (Z-Index erhöht, Debugging verbessert).
- **Config:** App-Konfiguration (Titel, Planungs-Modus) wird nun auch im lokalen Modus korrekt gespeichert und geladen.

## [1.1.12] - 2025-12-24
### Changed
- **System:** Renamed `app.js` to `main.js` to forcefully break stubborn browser caches and fix import errors.
- **Version:** Bumped to 1.1.12.

## [1.1.11] - 2025-12-24
### Fixed
- **Service Worker:** Fixed missing `CACHE_NAME` definition in `sw.js` causing SW registration to fail.
- **Cache Busting:** Added version query to `app.js` in `index.html` to force reload of JavaScript files.

## [1.1.10] - 2025-12-24
### Fixed
- **Cache Busting:** Added version query to `app.js` import in `index.html` to force browser refresh and fix persistent `SyntaxError` with imports.
- **Utils:** Verified `shareStation` export.

- Moved `shareStation` to `utils.js` and corrected imports.
- Restored missing exports `generateICS`, `openEventModal`, `closeEventModal` in `ui.js`.

## [1.1.9] - 2025-12-24
### Fixed
- Fixed critical syntax error causing app load failure (duplicate `searchAddress` declaration).


## [1.1.8] - 2025-12-24
### Fixed
- **Code:** Kritischer Syntax-Fehler in `ui.js` behoben, der das Laden der App verhinderte (doppelte Funktionsdeklaration & unvollständiger Code-Block).

## [1.1.7] - 2025-12-24
### Fixed
- **Admin:** Fix für "Station bearbeiten" - Modal öffnet nun zuverlässig, auch wenn es vorher geschlossen war.
- **Admin:** Marker sind nun auf der Karte verschiebbar (Drag & Drop) und aktualisieren sofort die Koordinaten im Bearbeiten-Formular.
- **Admin:** "Neue Station" wird sofort auf der Karte angezeigt (Refresh Map).

## [1.1.6] - 2025-12-24
### Added
- **Admin:** Vollständige Implementierung der Admin-Tools (JSON Import/Export, Konfiguration, Downloads, Broadcasts).
- **Admin:** Event-Verwaltung (Erstellen, Bearbeiten, Löschen) mit Stations-Verknüpfung und Adress-Suche.
- **Admin:** "Neue Station"-Button erstellt nun direkt Marker in Kartenmitte.

## [1.1.5] - 2025-12-23
### Added
- **UI:** Timeline-Ansicht für das Programm implementiert (chronologisch sortiert, mit "Jetzt"-Status).

### Fixed
- **Code:** Syntax-Fehler (doppelte Funktionsdeklaration) behoben, der die App blockiert hat.

## [1.1.4] - 2025-12-23
### Added
- **Admin:** Bearbeiten, Löschen und Bild-Upload für Stationen ist nun voll funktionsfähig.
- **Admin:** Unterstützung für Tags und Uhrzeiten im Bearbeiten-Dialog.

## [1.1.3] - 2025-12-23
### Fixed
- **Sharing:** Fix für den Teilen-Button im Station-Popup. ID wird nun korrekt übergeben und Fallback für Clipboard verbessert.

## [1.1.2] - 2025-12-23
### Added
- **Features:** "Route" und "Maps" Buttons im Station-Popup sind nun funktional.
- **Sharing:** "Teilen"-Button nutzt nun die native Web Share API (oder Clipboard Fallback).

### Fixed
- **Bugfix:** Fehler "No ID for toggleLike" behoben (ID 0 wird nun korrekt akzeptiert).

## [1.1.1] - 2025-12-23
### Fixed
- **UI:** Fix für das Station-Modal (Popup).
    - Öffnet nun korrekt animiert (statt am unteren Rand zu kleben).
    - Höherer Z-Index (2000), damit es immer über der Navigation liegt.
    - "X"-Button und Hintergrund-Klick schließen das Modal nun zuverlässig.

## [1.1.0] - 2025-12-23
### Added
- **Offline-First:** Alle externen Bibliotheken (Leaflet, Tailwind, Phosphor Icons) liegen nun lokal im `vendor/` Ordner.
- **Build System:** `package.json` und Tailwind CLI Setup hinzugefügt. CSS wird nun vorab kompiliert (`npm run build`).
- **Error Handling:** Globaler Error-Monitor zeigt dem Nutzer Fehlermeldungen anstatt einer weißen Seite.
- **Service Worker:** Optimiertes Caching für lokale Ressourcen.

### Fixed
- **Performance:** Tailwind Runtime Script entfernt (verhindert FOUC und spart CPU).
- **Bugfixes:** Fehlende JS-Dateien (`ui.js`, `admin.js`, `utils.js`) wiederhergestellt und Importe korrigiert.
- **Map:** Leaflet Routing Machine Source-Map Fehler behoben.

## [1.0.0] - Initial Release
- Erste Version der Lichternacht App.


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
