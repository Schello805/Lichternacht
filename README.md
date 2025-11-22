# 🕯️ Lichternacht Bechhofen 2025 - Web App

Eine Progressive Web App (PWA) für die Lichternacht in Bechhofen. Bietet eine interaktive Karte, Programmübersicht und Offline-Funktionalität für Besucher.

## ✨ Features

*   **Interaktive Karte:** Alle Stationen (Essen, Trinken, WC, Parken) auf einer Karte.
*   **Navigation:** Integriertes Routing vom aktuellen Standort zur gewählten Station.
*   **Programm:** Live-Anzeige des aktuellen und nächsten Programmpunkts.
*   **Offline-First:** Funktioniert nach dem ersten Laden auch ohne Internet (dank Service Worker).
*   **Admin-Modus:** Stationen und Events können direkt in der App bearbeitet, hinzugefügt oder gelöscht werden (gespeichert im LocalStorage oder Firebase).
*   **Installation:** Kann als App auf den Homescreen hinzugefügt werden.

## 🚀 Installation & Deployment

### Voraussetzungen
*   Ein Webserver (Apache, Nginx, etc.)
*   **WICHTIG:** HTTPS (SSL) ist zwingend erforderlich für Geolocation und Offline-Modus!

### Schritte

1.  **Repository klonen:**
    ```bash
    cd /var/www/html/  # Oder dein Webroot
    git clone https://github.com/DEIN_USERNAME/lichternacht.git .
    ```

2.  **Apache Konfiguration (Beispiel):**
    Stelle sicher, dass `.htaccess` Overrides erlaubt sind oder konfiguriere den VHost entsprechend.
    Da es eine statische Seite ist, reicht eine Standard-Konfig.

3.  **Updates einspielen:**
    Wenn du Änderungen am Code machst (z.B. neue Features), musst du die Version im `sw.js` erhöhen, damit die Nutzer das Update sofort erhalten:
    ```javascript
    // sw.js
    const CACHE_NAME = 'lichternacht-v2'; // <--- Hochzählen!
    ```

## 🛠️ Admin-Modus

Um Stationen zu bearbeiten:
1.  Klicke oben rechts auf das **Schloss-Icon**.
2.  Passwort eingeben: `licht2025`
3.  Du kannst nun:
    *   Stationen auf der Karte verschieben (Drag & Drop).
    *   Details bearbeiten und Bilder hochladen.
    *   Neue Stationen hinzufügen.
    *   Die Daten als JSON exportieren (für Backups).

## ⚙️ Konfiguration

Die Datei `config.js` steuert die Datenbank-Verbindung.
*   **Standard:** Ohne Änderung läuft die App im **Lokal-Modus**. Daten werden im Browser des Nutzers gespeichert (LocalStorage). Ideal für Tests.
*   **Firebase:** Um Daten zwischen allen Nutzern zu synchronisieren, trage deine Firebase-Daten in `config.js` ein.

## 📱 Tech Stack

*   **Frontend:** HTML5, Vanilla JS
*   **Styling:** Tailwind CSS (via CDN)
*   **Maps:** Leaflet.js & OpenStreetMap
*   **Icons:** Phosphor Icons
