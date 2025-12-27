# Lichternacht Bechhofen - PWA

Eine progressive Web App (PWA) für die Lichternacht Bechhofen.
Entwickelt mit Vanilla JavaScript, Firebase und TailwindCSS.

## ✨ Features

*   **Offline-First (PWA):** Funktioniert dank Service Worker und Caching auch bei schlechtem Netz komplett offline.
*   **Interaktive Karte:** Leaflet-Karte mit Standort-Tracking und Routing.
*   **Gamification:** Lichter-Pass, Check-Ins, Likes und Favoriten.
*   **Live-Updates:** Änderungen an Stationen/Events sind sofort bei allen Nutzern sichtbar (Firestore Realtime).
*   **Admin-Tools:** Integriertes CMS zum Bearbeiten von Stationen, Events und Push-Nachrichten (Broadcast).
*   **Performance:** Automatische Bild-Komprimierung beim Upload und optimiertes Caching.
*   **Feedback:** Integriertes Bug-Reporting per E-Mail.

## 📂 Projektstruktur

```
/
├── index.html          # Hauptseite (App Shell)
├── main.js             # Einstiegspunkt (Main Entry)
├── service-worker.js   # Service Worker (Offline-Fähigkeit & Caching)
├── manifest.json       # PWA Konfiguration (Name, Icons, Farben)
├── firestore.rules     # Sicherheitsregeln für die Datenbank
├── deploy.sh           # Deployment-Skript für den Server
├── server-htaccess     # Apache Config (wird zu .htaccess auf dem Server)
├── js/
│   ├── admin.js        # Admin-Funktionen (Import/Export, Login)
│   ├── auth.js         # Authentifizierung (Login, Logout, Listener)
│   ├── data.js         # Daten-Management & Seed-Daten
│   ├── firebase-init.js# Firebase Initialisierung
│   ├── gamification.js # Lichter-Pass, Levels, Likes
│   ├── map.js          # Leaflet Karte & Logik
│   ├── state.js        # Globaler State (Store)
│   ├── ui.js           # UI-Rendering & Interaktionen
│   └── utils.js        # Hilfsfunktionen
└── icons/              # App Icons
```

## 🚀 Deployment (Server)

Die App ist für einen **Apache Webserver** optimiert.

### Erst-Installation
1.  Repository auf den Server klonen: `git clone https://github.com/Schello805/Lichternacht.git .`
2.  Deployment-Skript ausführbar machen: `chmod +x deploy.sh`
3.  Einmalig ausführen: `./deploy.sh`

### Updates einspielen
Um Änderungen von GitHub auf den Server zu laden, führe einfach das Skript aus:

```bash
./deploy.sh
```

Das Skript erledigt folgendes:
1.  `git pull` (Neuesten Code holen)
2.  Kopiert `server-htaccess` zu `.htaccess` (Damit Caching-Regeln stimmen und Nextcloud nicht stört).

**Wichtig:** Die Datei `.htaccess` sollte lokal nicht existieren (oder ignoriert werden), da sie oft Probleme mit Sync-Clients (Nextcloud) verursacht. Wir nutzen daher `server-htaccess` als Vorlage.

## 🛠 Entwicklung & Build

Das Projekt nutzt **TailwindCSS** für das Styling. Um CSS-Änderungen zu machen, musst du das CSS neu bauen:

1.  **Abhängigkeiten installieren:**
    ```bash
    npm install
    ```

2.  **CSS Bauen (Watch Mode für Entwicklung):**
    ```bash
    npm run watch
    ```

3.  **CSS für Produktion bauen:**
    ```bash
    npm run build
    ```

Die generierte Datei liegt unter `dist/output.css`.

## 🛠 Daten aktualisieren (Jährlicher Workflow)

Um die App für ein neues Jahr fit zu machen:

1.  **Admin-Login:** Logge dich in der App als Admin ein (Schloss-Icon).
2.  **Daten bearbeiten:** Lösche alte Events/Stationen, lege neue an.
3.  **Backup erstellen:**
    *   Gehe ins Admin-Panel.
    *   Klicke auf **"Download data.js"**.
4.  **Code updaten:**
    *   Nimm die heruntergeladene `data.js`.
    *   Ersetze damit die Datei `js/data.js` im Projektordner.
    *   Commit & Push zu GitHub.
5.  **Reset (Optional):**
    *   Klicke auf "Jahr ändern" oder "Reset", um die Datenbank für alle Nutzer sauber zu starten.

## ⚙️ Konfiguration

Die Konfiguration (API Keys) liegt in `js/firebase-init.js`.
Stelle sicher, dass deine Firebase Security Rules (`firestore.rules`) in der Firebase Console veröffentlicht sind.

## 📦 Tech Stack

- **Frontend:** HTML5, Vanilla JS, TailwindCSS (Local Build)
- **Backend:** Firebase (Firestore, Auth)
- **Maps:** Leaflet.js & OpenStreetMap
- **Icons:** Phosphor Icons
- **PWA:** Workbox (Service Worker)

## 🆘 Notfall-Hilfe

*   **App lädt nicht?** Cache leeren oder `service-worker.js` unregisteren.
*   **Keine Daten?** Prüfe die Browser-Konsole (F12) auf rote Fehler.
*   **Login geht nicht?** Prüfe in der Firebase Console, ob "Email/Password" und "Anonymous" aktiviert sind.
