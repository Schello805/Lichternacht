# Lokal ausgelieferte Schriften

Unveränderte WOFF2-Dateien aus der Google-Fonts-Auslieferung, bezogen am
14.11.2026. Das Frontend lädt ausschließlich `fonts.css` und die relativen
Dateien in diesem Verzeichnis, nicht die nachstehenden Bezugsquellen.

- Cinzel v26: Gewichte 400/700, Latin und Latin Extended (gemeinsame variable Dateien).
- Lato v25: Gewichte 300/400/700, jeweils Latin und Latin Extended.
- `font-display: swap`; Umlaute, ß, Eurozeichen und erweiterte lateinische Zeichen bleiben enthalten.
- Lizenzen einschließlich Urheberangaben: `Cinzel-OFL.txt` und `Lato-OFL.txt` (SIL OFL 1.1).

Bezugsquellen:

- https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@300;400;700&display=swap
- https://github.com/google/fonts/tree/main/ofl/cinzel
- https://github.com/google/fonts/tree/main/ofl/lato

Dateien nicht unter unveränderten Namen ersetzen: Bei einer Aktualisierung
Dateinamen und `local-fonts-v1` im Service Worker versionieren.
Die alte `sw.js` bleibt als gezielter Abmelde-Worker für Altinstallationen erhalten.
