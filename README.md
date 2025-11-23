# Lichternacht Bechhofen - PWA

Eine progressive Web App (PWA) für die Lichternacht Bechhofen.
Entwickelt mit Vanilla JavaScript, Firebase und TailwindCSS.

## 📂 Projektstruktur

```
/
├── index.html          # Hauptseite (App Shell)
├── app.js              # Einstiegspunkt (Main Entry)
├── sw.js               # Service Worker (Offline-Fähigkeit & Caching)
├── manifest.json       # PWA Konfiguration (Name, Icons, Farben)
├── firestore.rules     # Sicherheitsregeln für die Datenbank
├── js/
│   ├── admin.js        # Admin-Funktionen (Import/Export, Login)
│   ├── auth.js         # Authentifizierung (Login, Logout, Listener)
│   ├── data.js         # Daten-Management & Seed-Daten (DAS HIER UPDATEN!)
│   ├── firebase-init.js# Firebase Initialisierung
│   ├── gamification.js # Lichter-Pass, Levels, Likes
│   ├── map.js          # Leaflet Karte & Logik
│   ├── state.js        # Globaler State (Store)
│   ├── ui.js           # UI-Rendering & Interaktionen
│   └── utils.js        # Hilfsfunktionen
└── icons/              # App Icons
```

## 🚀 Deployment / Update

Da es sich um eine statische Web-App handelt, ist das Deployment sehr einfach:

1.  **Dateien hochladen:** Lade alle Dateien (außer `.git` oder `.vscode`) auf deinen Webserver hoch.
2.  **Cache leeren:** Da der Service Worker (`sw.js`) aggressiv cacht, müssen Nutzer die Seite oft 2x neu laden, um Änderungen zu sehen.
    *   *Tipp:* Wenn du Code änderst, erhöhe die Version in `sw.js` (ganz oben: `CACHE_NAME`), damit Browser das Update erzwingen.

## 🛠 Daten aktualisieren (Jährlicher Workflow)

Um die App für ein neues Jahr fit zu machen:

1.  **Admin-Login:** Logge dich in der App als Admin ein.
2.  **Daten bearbeiten:** Lösche alte Events/Stationen, lege neue an.
3.  **Backup erstellen:**
    *   Gehe ins Admin-Panel (Schloss-Icon).
    *   Klicke auf **"Download data.js"**.
4.  **Code updaten:**
    *   Nimm die heruntergeladene `data.js`.
    *   Ersetze damit die Datei `js/data.js` auf deinem Server/in deinem Projektordner.
5.  **Reset (Optional):**
    *   Klicke auf "Jahr ändern" oder "Reset", um die Datenbank für alle Nutzer sauber zu starten.

## ⚙️ Konfiguration

Die Konfiguration (API Keys) liegt in `js/firebase-init.js` (oder wird global injiziert).
Stelle sicher, dass deine Firebase Security Rules (`firestore.rules`) in der Firebase Console veröffentlicht sind.

## 📦 Abhängigkeiten (CDNs)

Die App lädt folgende Bibliotheken von externen Servern:
- **Firebase (v10.13.1):** Datenbank & Auth
- **Leaflet (v1.9.4):** Karte
- **Phosphor Icons:** Icons
- **TailwindCSS:** Styling

Sollte die App offline/komisch aussehen, prüfe deine Internetverbindung oder ob diese CDNs erreichbar sind.

## 🆘 Notfall-Hilfe

*   **App lädt nicht?** Cache leeren, Service Worker unregisteren (DevTools -> Application -> Service Workers).
*   **Keine Daten?** Prüfe die Browser-Konsole (F12) auf rote Fehler.
*   **Login geht nicht?** Prüfe in der Firebase Console, ob "Email/Password" und "Anonymous" aktiviert sind.
