# Lichternacht Bechhofen - PWA

Eine progressive Web App (PWA) für die Lichternacht Bechhofen.
Entwickelt mit Vanilla JavaScript, Firebase und TailwindCSS.

## ✨ Features

*   **Offline-First (PWA):** Funktioniert dank Service Worker und Caching auch bei schlechtem Netz komplett offline.
*   **Interaktive Karte:** Leaflet-Karte mit Standort-Tracking und Routing.
*   **Gamification:** Lichter-Pass, Check-Ins, Likes und Favoriten.
*   **Onboarding:** Mini-Tour (Kurze Tour) für neue Nutzer; kann über die Hilfe („Tour erneut anzeigen“) erneut gestartet werden.
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

1.  **Planungs-Modus aktivieren:**
    *   Gehe ins Admin-Panel -> "App Titel & Untertitel".
    *   Aktiviere "🚧 Planungs-Modus aktiv".
    *   Dies zeigt Besuchern ein Banner, dass die Daten noch nicht aktuell sind.

2.  **Daten bearbeiten:**
    *   Logge dich als Admin ein.
    *   Lösche alte Events/Stationen und lege neue an.
    *   Änderungen sind sofort live.

3.  **Backup erstellen (Seed-Daten):**
    *   Gehe ins Admin-Panel.
    *   Klicke auf **"Download data.js"**.
    *   Ersetze damit die Datei `js/data.js` im Projektordner und lade es zu GitHub hoch.
    *   *Dies dient als Backup, falls die App offline genutzt wird.*

4.  **Likes zurücksetzen (Optional):**
    *   Im Admin-Panel unter "App Titel & Untertitel" kannst du alle Likes (Flammen) auf 0 setzen.

5.  **Planungs-Modus beenden:**
    *   Sobald alles fertig ist, deaktiviere den Planungs-Modus wieder.

## ⚙️ Konfiguration

Die App benötigt eine Konfigurationsdatei `config.js` im Hauptverzeichnis (dort wo auch `index.html` liegt). Diese Datei enthält sensible Daten (API Keys) und wird **nicht** mit Git übertragen (sie steht in `.gitignore`).

### 1. `config.js` erstellen
Erstelle lokal oder auf dem Server eine Datei `config.js` mit folgendem Inhalt:

```javascript
const __firebase_config = JSON.stringify({
    apiKey: "DEIN_API_KEY",
    authDomain: "dein-projekt.firebaseapp.com",
    projectId: "dein-projekt",
    storageBucket: "dein-projekt.firebasestorage.app",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef...",
    measurementId: "G-XYZ..."
});

const __app_id = "lichternacht-2025";
```

### 2. Upload auf den Server
Lade diese Datei manuell (per FTP/SFTP) auf deinen Server.

**Wichtig:** Ohne diese Datei funktioniert der Login und der Zugriff auf die Datenbank nicht!

### 3. Firebase Setup
Stelle sicher, dass in der Firebase Console:
*   **Authentication:** "Email/Password" und "Anonymous" aktiviert sind.
*   **Firestore:** Die Datenbank erstellt ist.
*   **Rules:** Die Regeln aus `firestore.rules` veröffentlicht sind.

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

## 📲 Installation (PWA)

Die Installation wird im Willkommens-Dialog über einen einzelnen Button **„App installieren“** angeboten. In Browsern ohne Install-Prompt (z.B. Safari) nutzt man stattdessen die System-Funktion „Zum Home-Bildschirm“.
