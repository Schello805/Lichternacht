# Bugreport E-Mail Versand (Server)

Die Web-App läuft bei dir über Apache als **statisches Hosting**. Damit `POST /api/bug-report` funktioniert, braucht es zusätzlich einen kleinen Backend‑Dienst (Python `server.py`), der die E‑Mail verschickt.

## 1) `.env` auf dem Server anlegen

Im Webroot (`/var/www/html/Lichternacht`) eine `.env` anlegen (liegt in `.gitignore`):

- Datei: `.env` (siehe `.env.example`)
- Pflicht: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- Optional: `SMTP_PORT`, `SMTP_SSL`, `BUGREPORT_TO`, `BUGREPORT_FROM`

## 2) Python-API als Dienst starten (systemd)

Beispiel (Ubuntu):

1. Service-Datei anlegen:

`/etc/systemd/system/lichternacht-api.service`

```ini
[Unit]
Description=Lichternacht API (bug report email)
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/html/Lichternacht
ExecStart=/usr/bin/python3 /var/www/html/Lichternacht/server.py
Restart=on-failure
Environment=PORT=8000
Environment=BIND_HOST=127.0.0.1

[Install]
WantedBy=multi-user.target
```

2. Aktivieren/Starten:

```bash
systemctl daemon-reload
systemctl enable --now lichternacht-api
systemctl status lichternacht-api
```

## 3) Apache Reverse Proxy für `/api/bug-report`

Apache muss die Requests an den Python‑Dienst auf `127.0.0.1:8000` weiterleiten.

Module aktivieren:

```bash
a2enmod proxy proxy_http
systemctl reload apache2
```

In deinem vHost (oder einer Site-Config) ergänzen:

```apache
ProxyPass        "/api/"  "http://127.0.0.1:8000/api/"
ProxyPassReverse "/api/"  "http://127.0.0.1:8000/api/"

# optional, falls du /upload per Backend nutzen willst:
ProxyPass        "/upload"  "http://127.0.0.1:8000/upload"
ProxyPassReverse "/upload"  "http://127.0.0.1:8000/upload"
```

Dann Apache reload:

```bash
systemctl reload apache2
```

## Test

```bash
curl -i -X POST http://localhost/api/bug-report \
  -H "Content-Type: application/json" \
  -d '{"subject":"Test","text":"Hello"}'
```

Erwartet: `200 {"ok": true}` (und E‑Mail kommt an).

