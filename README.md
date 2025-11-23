# Lichternacht Bechhofen 2025 - PWA

Die offizielle Progressive Web App (PWA) für die Lichternacht Bechhofen 2025.

**Live Demo:** [https://lichternacht.bechhofen.de](https://lichternacht.bechhofen.de) (Beispiel)

## Features

### Für Besucher
*   **Interaktive Karte:** Übersicht aller Stationen mit Leaflet.js.
*   **Offline-First:** Funktioniert dank Service Worker auch ohne Internetverbindung.
*   **Echtzeit-Programm:** Anzeige des aktuellen und nächsten Events.
*   **Favoriten (❤️):** Markiere Stationen als Favoriten und filtere danach.
*   **Voting (🔥):** Gib Stationen einen Like, wenn sie dir gefallen.
*   **Lichter-Pass (🏆):** Checke an 10 Stationen ein (GPS-basiert) und erhalte eine Belohnung.
*   **Dark Mode:** Augenfreundliches Design für die Nacht.

### Für Admins
*   **Login:** Sicherer Login via E-Mail (Firebase Auth).
*   **Editor:** Bearbeiten von Stationen (Name, Beschreibung, Angebot, Tags) direkt in der App.
*   **Bilder:** Upload per Drag & Drop oder Klick.
*   **Excel-Import/Export:** Massenbearbeitung von Daten via Copy & Paste (TSV-Format).
*   **Cloud Sync:** Synchronisation aller Daten über Google Firebase (Firestore).

## Tech Stack

*   **Frontend:** HTML5, Vanilla JavaScript
*   **Styling:** Tailwind CSS (via CDN), Custom CSS
*   **Karte:** Leaflet.js, OpenStreetMap, CartoDB Tiles
*   **Backend:** Firebase (Firestore, Authentication)
*   **Icons:** Phosphor Icons

## Installation & Setup

### 1. Klonen
```bash
git clone https://github.com/Schello805/Lichternacht.git
cd Lichternacht
```

### 2. Konfiguration
Erstelle eine `config.js` im Hauptverzeichnis mit deinen Firebase-Daten:

```javascript
const __firebase_config = JSON.stringify({
  apiKey: "DEIN_API_KEY",
  authDomain: "dein-projekt.firebaseapp.com",
  projectId: "dein-projekt",
  // ...
});

const __app_id = "lichternacht-2025";
```

### 3. Deployment
Lade die Dateien einfach auf einen beliebigen Webserver (Apache, Nginx, GitHub Pages).
Da es eine reine Client-Side App ist, wird kein Node.js Server benötigt.

**Wichtig:** Für PWA-Funktionen (Service Worker) und Geolocation ist **HTTPS zwingend erforderlich**.

## Admin-Nutzung

1.  Klicke auf das Schloss-Icon oben rechts.
2.  Logge dich mit der Admin-Email (`michael@schellenberger.biz`) ein.
3.  Nutze den "Edit"-Button in den Stationen oder das Admin-Menü für neue Einträge.
4.  **Massenbearbeitung:** Klicke auf "Export", kopiere den Text in Excel, bearbeite ihn, und importiere ihn wieder.

## Lizenz

MIT License. Created by Michael Schellenberger.
