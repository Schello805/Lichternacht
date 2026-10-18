#!/bin/bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Verwendung: ./deploy.sh vX.Y.Z"
  echo "Beispiel:   ./deploy.sh v1.4.270"
  exit 64
fi

RELEASE_TAG="$1"
if [[ ! "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ Bitte einen Release-Tag im Format vX.Y.Z angeben."
  exit 64
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Lokale Änderungen gefunden. Bitte zuerst sichern oder verwerfen."
  exit 1
fi

# 1. Exakt den freigegebenen Release holen
echo "📥 Hole Release ${RELEASE_TAG} von GitHub..."
git fetch origin --tags --prune

if ! git rev-parse --verify --quiet "refs/tags/${RELEASE_TAG}" >/dev/null; then
  echo "❌ Release-Tag ${RELEASE_TAG} wurde nicht gefunden."
  exit 1
fi

git checkout --detach "${RELEASE_TAG}"

# 2. Server-Config aktivieren
# Wir kopieren server-htaccess zu .htaccess, damit Apache sie liest.
echo "⚙️  Aktualisiere Server-Konfiguration..."
cp server-htaccess .htaccess

# 3. API neu starten, damit Backend-Änderungen (E-Mail, Fehlerlogs, Bild-Upload) aktiv werden.
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files lichternacht-api.service >/dev/null 2>&1; then
  echo "🔄 Starte Lichternacht API neu..."
  systemctl restart lichternacht-api
fi

echo "✅ Release ${RELEASE_TAG} ist jetzt aktiv."
