#!/bin/bash

# 1. Neueste Version holen
echo "📥 Hole Änderungen von GitHub..."
git pull

# 2. Server-Config aktivieren
# Wir kopieren server-htaccess zu .htaccess, damit Apache sie liest.
echo "⚙️  Aktualisiere Server-Konfiguration..."
cp server-htaccess .htaccess

# 3. API neu starten, damit Backend-Änderungen (E-Mail, Fehlerlogs, Bild-Upload) aktiv werden.
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files lichternacht-api.service >/dev/null 2>&1; then
  echo "🔄 Starte Lichternacht API neu..."
  systemctl restart lichternacht-api
fi

echo "✅ Update fertig! Die Lichternacht App ist aktuell."
