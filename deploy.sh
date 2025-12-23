#!/bin/bash

# 1. Neueste Version holen
echo "📥 Hole Änderungen von GitHub..."
git pull

# 2. Server-Config aktivieren
# Wir kopieren server-htaccess zu .htaccess, damit Apache sie liest.
echo "⚙️  Aktualisiere Server-Konfiguration..."
cp server-htaccess .htaccess

echo "✅ Update fertig! Die Lichternacht App ist aktuell."
