# Changelog

## [1.4.117] - 2026-07-26
### Added
- **Anonyme Nutzungsanalyse:** Lichter‑Pass Check-ins werden ohne Namen, E-Mail oder GPS zentral für Admin-Auswertungen gespeichert.
- **Admin Summary:** Adminbereich zeigt Check-ins, aktive Geräte, Top-Stationen, Uhrzeiten und Lessons Learned mit CSV-Export und Summary-Mail.

## [1.4.116] - 2026-07-26
### Added
- **Lichter‑Pass Gewinnspiel:** Nach dem 3. Check-in kann der Nutzer freiwillig mit Name und E-Mail teilnehmen.
- **Eventende:** Nach Eventende fragt die App Gewinner aktiv, ob sie den erreichten Preis anfordern möchten.
- **Rechtliches:** Hilfeseite, Datenschutz und neue Gewinnspielhinweise erklären Teilnahme, Preisanforderung und Ablauf nach der Veranstaltung.

## [1.4.115] - 2026-07-26
### Fixed
- **Tour:** Der Deep-Link `?tour=1` wird nach dem Start aus der URL entfernt, damit „Überspringen“ beim Neuladen nicht wieder überschrieben wird.

## [1.4.114] - 2026-07-26
### Fixed
- **CSV Import:** CSV-Parser wird jetzt ebenfalls versioniert geladen, damit kein alter Parser aus dem Browser-/Service-Worker-Cache verwendet wird.

## [1.4.113] - 2026-07-26
### Fixed
- **Onboarding:** Abgelehnte oder abgeschlossene Hinweise bleiben jetzt auch nach App-Updates ausgeblendet.

## [1.4.112] - 2026-07-26
### Changed
- **CSV Export:** Stationen und Events werden als Semikolon-CSV exportiert; Admin-Hinweise erklären Spaltentrenner und Felder klarer.
- **CSV Felder:** Alte `desc`-CSV-Spalte entfernt; Events nutzen jetzt `description`, Stationen weiterhin `address`.

## [1.4.111] - 2026-07-26
### Fixed
- **CSV Import:** Semikolon-, Komma- und Tab-getrennte CSV-Dateien werden automatisch erkannt; Excel-CSV mit Base64-Bildern importiert wieder korrekt.

## [1.4.110] - 2026-07-26
### Added
- **Admin Tabellenübersicht:** Stationen lassen sich nach Nr. und Name auf-/absteigend sortieren.

## [1.4.109] - 2026-07-26
### Fixed
- **Admin Tabellenübersicht:** Stationen und Programmpunkte zeigen jetzt alle CSV-Felder und werden vor dem Export aus dem aktuellen App-State neu gerendert.

## [1.4.108] - 2026-07-26
### Improved
- **Stationsmodal:** Link ist jetzt als dezentes Icon neben dem Stationsnamen statt als großer Button sichtbar.
- **Lichter‑Pass:** Verwirrenden Button „Preise kopieren“ entfernt.

## [1.4.107] - 2026-07-26
### Improved
- **Programm/Karte:** „Auf Karte zeigen“ zoomt näher heran und lässt die Zielstation deutlich pulsieren.
- **Stationsmodal:** Aktionsbuttons unten sind jetzt gleich groß und kompakter beschriftet.

## [1.4.106] - 2026-07-26
### Improved
- **Admin-Tooltips:** Tooltips erscheinen jetzt sofort per eigener UI statt mit verzögerten Browser-Tooltips.

## [1.4.105] - 2026-07-26
### Added
- **Links:** Stationen und Programmpunkte haben optional ein Linkfeld, das in den Detailansichten als Button angezeigt wird.
- **CSV:** Stations- und Event-CSV unterstützen die neue Spalte `link`.

## [1.4.104] - 2026-07-26
### Added
- **Admin-Formulare:** Feldvalidierung, Zeichenzähler und Tooltips für erklärungsbedürftige Station-/Programmfelder ergänzt.

## [1.4.103] - 2026-07-26
### Fixed
- **Admin CSV-Import:** Tabellenübersicht, Karte, Liste und Programm werden nach dem Import sofort mit den neuen Daten aktualisiert.

## [1.4.102] - 2026-07-26
### Added
- **Header:** Klick auf Logo/Titel führt zurück zur Startansicht.

## [1.4.101] - 2026-07-26
### Changed
- **Admin CSV:** Stations-Export nutzt jetzt `address` statt missverständlichem `desc`; alte `desc`-Importe bleiben kompatibel.
- **Admin UI:** Stationsfeld heißt klarer „Angebot / Werbetext“.

## [1.4.100] - 2026-07-26
### Improved
- **Besucherstart:** Startkarte wartet jetzt, bis Tour/Login/Cookiebanner geschlossen sind, statt mit Overlays zu konkurrieren.

## [1.4.99] - 2026-07-26
### Improved
- **GPS:** Wiederholte Standortfehler werden gedrosselt, damit Nutzer nicht mehrfach denselben Hinweis sehen.

## [1.4.98] - 2026-07-26
### Added
- **E2E:** Playwright-Test für Besucher-Stationsmodal und Admin-Direktzugriff.
- **Admin:** Direkte Admin-URL `/admin/` und Tabellenübersicht für Stationen/Events.
- **Monitoring:** Client-Fehler werden serverseitig unter `logs/client-errors.log` protokolliert.

### Improved
- **Service Worker:** Cache-/Update-Logik ist klarer strukturiert.

## [1.4.97] - 2026-07-26
### Added
- **Tests:** Automatisierte Node-Tests für Datenvalidierung, CSV-Escaping und Event-Zeitfenster.
- **Admin CSV:** Vorlagen-Download, `offer`-Spalte und Import-Vorabprüfung für Stationen/Events.
- **Betrieb:** Security-/Produktionscheckliste in `SECURITY.md`.

### Improved
- **Updates:** Update-Hinweis und Service-Worker-Aktivierung sind robuster.

## [1.4.96] - 2026-07-26
### Fixed
- **Admin Datencheck:** Geänderte Admin/UI-Module werden cache-sicher geladen; neue Service Worker übernehmen sofort.

## [1.4.95] - 2026-07-26
### Added
- **CI:** GitHub Actions prüft bei Push/Pull Request automatisch Build und JavaScript-Syntax.

## [1.4.94] - 2026-07-26
### Changed
- **Stationen:** Angebot/Beschreibung ist auf 250 Zeichen begrenzt; maximal 5 Tags pro Station.

### Fixed
- **Admin Datencheck:** „Öffnen“ springt wieder zuverlässig zur betroffenen Station bzw. zum Event.

## [1.4.93] - 2026-07-09
### Changed
- **Adminbereich:** Admin-Konsole ist jetzt eine eigene App-Seite statt ein schwebendes Modal/Panel.

## [1.4.92] - 2026-06-30
### Changed
- **Lichter‑Pass:** CSV Export und „Preise kopieren“ sind nur noch im Admin-Modus sichtbar.

## [1.4.91] - 2026-06-28
### Improved
- **Besucherstart:** Neue kompakte Startkarte mit Eventstatus, Lichter‑Pass-Status und Schnellzugriff auf Karte, Stationen und Programm.
- **Lichter‑Pass:** Vor dem ersten Check-in erklärt ein dezenter Hinweis, warum GPS benötigt wird.
- **Motivation:** Nach einem Check-in zeigt die App, wie viele Stationen bis zur nächsten Preisstufe fehlen.

## [1.4.74] - 2026-04-19
### Improved
- **Hilfe:** Tracking-Einstellung als dezenter Footer-Link; Hinweis zu lokaler Speicherung (localStorage) klarer.
- **Admin Datencheck:** Station-Checks unterscheiden jetzt zwischen Adresse/Ort und Angebot/Beschreibung; Ausgabe zeigt zusätzlich den technischen Pfad.

## [1.4.75] - 2026-04-19
### Fixed
- **Programm:** „Live/Demnächst“ wird nur am konfigurierten Event-Datum angezeigt (Admin: Datum der Lichternacht/ICS).
- **Lichter‑Pass:** Check‑ins sind nur am Event-Datum möglich (wenn gesetzt), damit niemand Tage vorher sammeln kann.

## [1.4.76] - 2026-04-19
### Improved
- **Event-Zeitraum:** Admin-Feld unterstützt optional <Datum> <Start-Ende> (z.B. `22.11.2026 17:00-23:00`) für Programm-Status + Lichter‑Pass.

## [1.4.77] - 2026-04-19
### Fixed
- **Stabilität:** Verhindert „Importing binding name … is not found“ bei gemischten Caches (Fallback über Namespace-Import).

## [1.4.78] - 2026-04-19
### Fixed
- **Bug melden:** Reports werden jetzt unter `/public/reports` gespeichert (Regelpfad), kein `permission-denied` mehr.

## [1.4.79] - 2026-04-19
### Improved
- **Bug melden:** Fallback wenn Firestore blockiert ist (lokal speichern + in Zwischenablage kopieren).

## [1.4.80] - 2026-04-19
### Changed
- **Bug melden:** Öffnet jetzt immer einen E-Mail-Entwurf (statt Firestore).
### Fixed
- **Admin:** Datencheck-Toast erscheint nur im Adminpanel.

## [1.4.81] - 2026-04-19
### Changed
- **Bug melden:** Sendet Feedback serverseitig per E‑Mail (POST `/api/bug-report`) + kurzer Danke-Toast.

## [1.4.82] - 2026-04-19
### Fixed
- **Teilen-Link:** `?station=<id>` öffnet jetzt die Station (Karte + Detailansicht).

## [1.4.83] - 2026-04-19
### Improved
- **Station-Modal:** Button „Maps“ heißt jetzt „Navigation starten“.

## [1.4.84] - 2026-05-15
### Improved
- **Lichter‑Pass:** Neue Statuskarte mit Aktivzeit, Fortschritt, nächstem Ziel und verständlichem Ablauf.
- **Preise:** Gewinner können den erreichten Preis mit Kontaktdaten anfordern; der Admin erhält die Anfrage per E‑Mail.

## [1.4.85] - 2026-05-15
### Improved
- **Lichter‑Pass:** Besuchte Stationen werden mit Check-in-Zeitpunkt im Pass angezeigt und können als CSV exportiert werden.
- **Preise:** Preisanforderungen enthalten jetzt eine Anforderungs-ID sowie den Check-in-Verlauf für die Übergabeprüfung.
### Changed
- **Datenschutz/Hilfe:** Hinweise zu lokal gespeicherten Check-in-Zeitpunkten und Preisanforderungen ergänzt.

## [1.4.86] - 2026-05-15
### Improved
- **Admin-Kommunikation:** Datencheck prüft jetzt auch Event-Zeitraum und Preis-Konfiguration; Speichern zeigt gezielte Hinweise.
- **Admin-Validierung:** Stationen, Events, App-Konfiguration, Downloads und Preise geben klarere Warnungen bei unvollständigen Eingaben.
- **User-Hinweise:** Lichter‑Pass und Check-in-Feedback erklären dezenter, warum etwas klappt oder nicht klappt.

## [1.4.87] - 2026-05-15
### Improved
- **Mobile Layout:** Header, Suche, Filter und Stationskarten nutzen den Platz kompakter.
- **Filter-Menü:** Hauptfilter sind jetzt als 4er-Raster sichtbar statt horizontal scrollbar.

## [1.4.88] - 2026-05-15
### Added
- **Programm:** Programmpunkte öffnen jetzt eine Detailansicht mit Beschreibung, Ort, Karte, Route und Einzel-Kalenderdatei.
### Improved
- **Programm:** Zeitleiste zeigt Live-/Vorbei-/Countdown-Status und behält den Kartenbezug über „Zeigen“.

## [1.4.89] - 2026-05-15
### Fixed
- **Programm:** Klick auf Programmpunkte funktioniert wieder; kaputtes Inline-Quoting der Event-ID behoben.

## [1.4.90] - 2026-05-15
### Fixed
- **Programm:** Ohne gesetztes Event-Datum werden Live/Demnächst/Countdown nicht mehr auf heute berechnet.

## [1.4.73] - 2026-03-03
### Added
- **Admin UX:** Online/Lokal Statusanzeige im Admin (Online-only Funktionen werden im Lokal-Modus deaktiviert + Tooltip).
- **Admin Workflow:** Neue Stationen werden als **Entwurf** angelegt und erst beim Speichern persistiert (Abbrechen verwirft den Entwurf).
- **Admin Downloads:** Flyer-URLs können direkt per Button geöffnet werden (Preview).

### Fixed
- **Admin Downloads:** Validierung für Flyer-URLs (nur leer oder `http(s)://...`), verhindert fehlerhafte Einträge.

## [1.4.71] - 2026-01-26
### Fixed
- **PWA Cache:** Versions-/Cache-Bump, damit Service Worker und ES-Module immer konsistent neu geladen werden (Fix für „Importing binding name 'undoCheckIn' is not found“).

## [1.4.72] - 2026-01-26
### Fixed
- **Firebase/Safari:** Firestore nutzt jetzt Long-Polling (statt WebChannel), um Verbindungsprobleme/„access control checks“ in Safari/WebKit zu vermeiden.
- **Station-Modal:** Like-Button zeigt wieder zuverlässig Icon + Zähler (auch wenn bereits abgestimmt wurde).

## [1.4.70] - 2026-01-26
### Added
- **Mini-Tour:** Dezenter Hinweis „Kurze Tour (5 Punkte)“ + Tour-Overlay mit Fokus-Hervorhebung (ohne Abdunkeln). Tour führt auch durch **Stationen** und **Programm**.
- **Hilfe:** Button „Tour erneut anzeigen“ in der Anleitung.

### Improved
- **Pass-Zähler:** Anzeige jetzt als **🏆 besucht/gesamt** (z.B. 1/38) und verständliche Info beim Tippen.
- **User-Zähler:** Wird immer sichtbar angezeigt (Online: echte Zahl / Offline: 1 Gerät) und erklärt sich per Tippen.
- **Likes:** Likes werden in der Stationsliste jetzt immer angezeigt (auch 0), damit die Funktion sichtbar ist.
- **PWA Install UX:** Im Willkommens-Modal genügt ein Install-Button (kein doppelter Floating-Install-Button).

### Fixed
- **Admin Broadcast:** Robust gegen fehlende Firebase-Funktionen (Lazy Import), kein „doc is not a function“ Crash.
- **Route:** Route aus Stationsliste/Modal funktioniert stabil (Tab-Wechsel + GPS Auto-Start).
- **Check-in Undo:** Check-in kann per „X“ rückgängig gemacht werden.
- **Update Toast:** HTML-Struktur repariert (klickbar/sauber).

### Changed
- **Check-in Radius:** 50m → **25m**.

## [1.4.68] - 2025-12-30
### Feature
- **Karten-Highlight:** Beim Klick auf "Zeigen" (bei Events) oder "Karte" (bei Stationen) wird die Zielstation auf der Karte nun für 5 Sekunden deutlich pulsierend hervorgehoben. So findet man die gesuchte Nummer sofort, auch wenn viele Marker nebeneinander liegen.

## [1.4.67] - 2025-12-30
### Feature
- **LIVE-Modus:** Wenn ein Programmpunkt gerade läuft, wird er im Header nun prominent als **"JETZT LIVE"** (pulsierend) angezeigt, statt nur "Demnächst".
- **Auto-Scroll:** Die Programm-Timeline merkt sich nun den aktuell relevanten Event und ermöglicht das Springen dorthin (Klick auf den Header).
- **On-Site UX:** Das aktuelle Event wird in der Liste deutlicher hervorgehoben (gelber Ring).

## [1.4.66] - 2025-12-30
### Fixed
- **Toast entfernt:** Die Meldung "Sortierung: Standard (Nummer)" beim Klick auf "Alle" wurde entfernt, da sie unnötig war.

## [1.4.65] - 2025-12-30
### Improved
- **UI:** Dropdown-Design komplett an die Buttons angepasst:
    - Verwendet nun exakt denselben Container (Wrapper) mit `rounded-full`, Schatten und Rahmen.
    - Das Icon befindet sich nun **neben** dem Text (im gleichen Flex-Container), nicht mehr überlagert oder absolut positioniert.
    - Aktiv-Status (Gelb) wird auch auf das Dropdown angewendet, wenn eine Kategorie gewählt ist.

## [1.4.64] - 2025-12-30
### Improved
- **UI:** Pfeil im Dropdown-Menü entfernt für einen noch cleaneren Look ("Was soll der Pfeil?"). Das Dropdown sieht nun fast aus wie ein normaler Button, öffnet aber bei Klick die Auswahl.
- **Fix:** Korrektur einer veralteten Versionsreferenz im Service-Worker-Loader.

## [1.4.63] - 2025-12-30
### Improved
- **UI:** Dropdown-Menü "hübscher" gemacht:
    - **Form:** Nun ebenfalls stark abgerundet (`rounded-full`), passend zu den oberen Buttons.
    - **Icon:** Ein Trichter-Icon (`ph-funnel`) links hinzugefügt, um die Funktion "Filtern" zu verdeutlichen.
    - **Pfeil:** Der Pfeil nach unten wurde dezenter gestaltet (dünner, heller), damit er nicht so "klotzig" wirkt.

## [1.4.62] - 2025-12-30
### Fixed
- **Login-Modal:** Veraltete Versionsnummer entfernt, die im Login-Dialog noch angezeigt wurde.

## [1.4.61] - 2025-12-30
### Improved
- **UI:** Weitere Verbesserung der Filterleiste basierend auf User-Feedback:
    - **Dropdown statt Buttons:** Die Tag-Leiste (zweite Zeile) wurde durch ein sauberes Dropdown-Menü ersetzt ("Kategorie filtern...").
    - **Text-Korrektur:** "Nähe" wurde wieder zu "**in der Nähe**" geändert, da dies verständlicher ist.
    - **Design:** Das Dropdown fügt sich nahtlos in das moderne Design ein (grauer Hintergrund, abgerundet).

## [1.4.60] - 2025-12-30
### Improved
- **UI Makeover (Profi-Look):**
    - **Scrollbars entfernt:** Die hässlichen grauen Scrollbalken sind nun via CSS (`no-scrollbar`) erzwungen ausgeblendet.
    - **Hierarchie:** Die Hauptfilter (oben) sind nun prominente "Pills" mit Schatten, die Tags (unten) sind dezente, abgerundete "Chips" (hellgrau, eckiger).
    - **Spacing:** Linkes Padding (`px-4`) hinzugefügt, damit die Elemente nicht am Bildschirmrand kleben.
    - **Visuals:** Hover-Effekte und Active-States verfeinert (dunkelgrau für Tags bei Aktivierung).

## [1.4.59] - 2025-12-30
### Improved
- **UI:** Weitere Verfeinerung der Filterleiste:
    - Text "in der Nähe" auf "**Nähe**" verkürzt, um Platz zu sparen.
    - **Scrollbars ausgeblendet:** Die Scrollbalken in den Filterzeilen sind nun unsichtbar (`no-scrollbar`).
    - **Tags kompakter:** Die zweite Zeile (Tags) hat nun kleinere Buttons (`text-xs`) und weniger Abstand, um eine visuelle Hierarchie zu schaffen.
    - Zeilenabstand verringert (`gap-1.5`), damit weniger vertikaler Platz verbraucht wird.

## [1.4.58] - 2025-12-30
### Changed
- **UI:** Komplett neues Layout der Filterleiste:
    - **Zweizeilige Darstellung:** Die Hauptfilter (Alle, Nähe, Favoriten, Besucht) befinden sich nun in einer eigenen, fixierten Zeile oben.
    - **Scrollbare Tags:** Die Kategorie-Tags (Essen, Trinken, etc.) sind in einer zweiten, scrollbaren Zeile darunter angeordnet.
    - Dies löst das Platzproblem auf Smartphones endgültig.

## [1.4.57] - 2025-12-30
### Improved
- **UI:** Platzoptimierung in der Filterleiste, damit auf Smartphones die Hauptfilter wieder ohne Scrollen sichtbar sind.
    - Padding der Buttons leicht reduziert (`px-3` statt `px-4`).
    - Abstand der Trennlinie minimiert (`mx-1` statt `mx-2`).
    - Dies spart insgesamt ca. 40px Platz ein.

## [1.4.56] - 2025-12-30
### Fixed
- **UI:** Filter-Trennlinie verwendet nun Inline-Styles, um sicherzustellen, dass sie auch ohne CSS-Rebuild korrekt angezeigt wird.
- **Debug:** Konsolenausgabe beim Rendern der Filterleiste hinzugefügt.

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
