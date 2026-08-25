import http.server
import socketserver
import os
import json
import time
import smtplib
import ssl
import re
import secrets
import urllib.parse
import urllib.request
import urllib.error
import shutil
import resource
from email.message import EmailMessage

HOST = os.environ.get('BIND_HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '8000'))
UPLOAD_DIR = 'downloads'
STATION_IMAGE_DIR = os.path.join(UPLOAD_DIR, 'stations')
EVENT_IMAGE_DIR = os.path.join(UPLOAD_DIR, 'events')
LOG_DIR = 'logs'

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)
if not os.path.exists(STATION_IMAGE_DIR):
    os.makedirs(STATION_IMAGE_DIR)
if not os.path.exists(EVENT_IMAGE_DIR):
    os.makedirs(EVENT_IMAGE_DIR)
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

def load_dotenv(path='.env'):
    """
    Minimal .env loader (no external deps).
    - Supports KEY=VALUE (optional quotes)
    - Ignores empty lines and comments starting with '#'
    - Does not override existing environment variables
    """
    try:
        if not os.path.isfile(path):
            return
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith('#'):
                    continue
                if '=' not in s:
                    continue
                key, value = s.split('=', 1)
                key = key.strip()
                value = value.strip()
                if not key or key in os.environ:
                    continue
                if (len(value) >= 2) and ((value[0] == value[-1] == '"') or (value[0] == value[-1] == "'")):
                    value = value[1:-1]
                os.environ[key] = value
    except Exception:
        # Silent by design; server should still start without .env
        return


load_dotenv()

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Permissions-Policy', 'geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)')
        super().end_headers()

    def _send_json(self, status, payload):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def _read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except Exception:
            length = 0
        if length <= 0 or length > 200_000:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return None

    def _rate_limit(self):
        # Very small in-memory throttle to reduce accidental spam.
        # Not a security feature; for real deployments, add proper protections.
        now = time.time()
        ip = self.client_address[0] if self.client_address else 'unknown'
        try:
            store = getattr(self.server, "_rate_store", {})
            last = store.get(ip, 0)
            if now - last < 10:
                return False
            store[ip] = now
            setattr(self.server, "_rate_store", store)
        except Exception:
            pass
        return True

    def _send_bug_report_email(self, subject, text, html_content=None):
        to_addr = os.environ.get('BUGREPORT_TO', 'admin@schellenberger.biz')
        from_addr = os.environ.get('BUGREPORT_FROM', to_addr)

        host = os.environ.get('SMTP_HOST', '').strip()
        user = os.environ.get('SMTP_USER', '').strip()
        password = os.environ.get('SMTP_PASS', '').strip()
        port = int(os.environ.get('SMTP_PORT', '587'))
        use_ssl = os.environ.get('SMTP_SSL', '').strip().lower() in ('1', 'true', 'yes', 'on')

        if not host or not user or not password:
            raise RuntimeError("SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)")

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = to_addr
        msg.set_content(text)
        if html_content:
            msg.add_alternative(html_content, subtype='html')

        if use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            context = ssl.create_default_context()
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls(context=context)
                smtp.ehlo()
                smtp.login(user, password)
                smtp.send_message(msg)

    def _verify_admin_token(self):
        authorization = self.headers.get('Authorization', '')
        api_key = os.environ.get('FIREBASE_API_KEY', '').strip()
        if not api_key:
            try:
                with open('config.js', 'r', encoding='utf-8') as config_file:
                    match = re.search(r'apiKey\s*:\s*["\']([^"\']+)["\']', config_file.read())
                    api_key = match.group(1).strip() if match else ''
            except OSError:
                api_key = ''
        if not authorization.startswith('Bearer ') or not api_key:
            return False
        token = authorization[7:].strip()
        if not token or len(token) > 5000:
            return False

        endpoint = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + urllib.parse.quote(api_key)
        request = urllib.request.Request(
            endpoint,
            data=json.dumps({'idToken': token}).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Referer': os.environ.get('FIREBASE_AUTH_REFERER', 'https://lichternacht-bechhofen.de/')
            },
            method='POST'
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode('utf-8'))
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError):
            return False

        users = payload.get('users') or []
        email = str(users[0].get('email') or '').strip().lower() if users else ''
        allowed = {
            item.strip().lower()
            for item in os.environ.get('ADMIN_EMAILS', 'michael@schellenberger.biz').split(',')
            if item.strip()
        }
        return bool(email and email in allowed)

    def _write_client_error_log(self, data):
        def sanitize(value, limit):
            text = str(value or '')
            text = re.sub(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', '[E-Mail entfernt]', text, flags=re.I)
            text = re.sub(r'([?&](?:lat|lng|latitude|longitude|email|name|station|checkin)=[^\s&#]*)', '[Parameter entfernt]', text, flags=re.I)
            text = re.sub(r'\b-?\d{1,3}\.\d{4,}\s*[,;/ ]\s*-?\d{1,3}\.\d{4,}\b', '[Koordinaten entfernt]', text)
            return text[:limit]

        entry = {
            "ts": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "type": sanitize(data.get("type") or "error", 60),
            "message": sanitize(data.get("message"), 1000),
            "source": sanitize(data.get("source"), 500).split('?', 1)[0],
            "line": data.get("line") or 0,
            "column": data.get("column") or 0,
            "page": sanitize(data.get("page"), 300).split('?', 1)[0],
            "appVersion": sanitize(data.get("appVersion"), 40),
            "stack": sanitize(data.get("stack"), 4000)
        }
        with open(os.path.join(LOG_DIR, 'client-errors.log'), 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def _collect_system_metrics(self):
        cpu_count = os.cpu_count() or 1
        load_1, load_5, load_15 = os.getloadavg() if hasattr(os, 'getloadavg') else (0.0, 0.0, 0.0)
        cpu_load_percent = min(100.0, max(0.0, load_1 / cpu_count * 100))
        try:
            def read_cpu_times():
                with open('/proc/stat', 'r', encoding='utf-8') as cpu_file:
                    values = [int(value) for value in cpu_file.readline().split()[1:]]
                idle = values[3] + (values[4] if len(values) > 4 else 0)
                return sum(values), idle

            total_before, idle_before = read_cpu_times()
            time.sleep(0.1)
            total_after, idle_after = read_cpu_times()
            total_delta = total_after - total_before
            if total_delta > 0:
                cpu_load_percent = max(0.0, min(100.0, (1 - (idle_after - idle_before) / total_delta) * 100))
        except (OSError, ValueError, IndexError):
            pass

        memory_total = 0
        memory_available = 0
        try:
            with open('/proc/meminfo', 'r', encoding='utf-8') as meminfo:
                values = {}
                for line in meminfo:
                    key, raw = line.split(':', 1)
                    values[key] = int(raw.strip().split()[0]) * 1024
                memory_total = values.get('MemTotal', 0)
                memory_available = values.get('MemAvailable', values.get('MemFree', 0))
        except (OSError, ValueError):
            pass

        disk = shutil.disk_usage(os.getcwd())
        image_bytes = 0
        image_count = 0
        for root, _, files in os.walk(UPLOAD_DIR):
            for filename in files:
                try:
                    image_bytes += os.path.getsize(os.path.join(root, filename))
                    image_count += 1
                except OSError:
                    pass

        uptime_seconds = 0
        try:
            with open('/proc/uptime', 'r', encoding='utf-8') as uptime_file:
                uptime_seconds = int(float(uptime_file.read().split()[0]))
        except (OSError, ValueError, IndexError):
            pass

        process_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        if os.uname().sysname == 'Darwin':
            process_rss_bytes = int(process_rss)
        else:
            process_rss_bytes = int(process_rss * 1024)

        return {
            "ok": True,
            "generatedAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "cpu": {"count": cpu_count, "loadPercent": round(cpu_load_percent, 1), "load1": round(load_1, 2), "load5": round(load_5, 2), "load15": round(load_15, 2)},
            "memory": {"total": memory_total, "available": memory_available, "usedPercent": round((1 - memory_available / memory_total) * 100, 1) if memory_total else None},
            "disk": {"total": disk.total, "free": disk.free, "usedPercent": round(disk.used / disk.total * 100, 1) if disk.total else None},
            "service": {"uptimeSeconds": uptime_seconds, "processRss": process_rss_bytes},
            "images": {"count": image_count, "bytes": image_bytes}
        }

    def do_POST(self):
        image_endpoint = self.path.split('?', 1)[0]
        if image_endpoint in ('/api/station-image', '/api/event-image'):
            if not self._verify_admin_token():
                self._send_json(403, {"ok": False, "error": "Admin-Anmeldung ungültig"})
                return
            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'image/webp':
                self._send_json(400, {"ok": False, "error": "Nur optimierte WebP-Bilder sind erlaubt"})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            if length <= 0 or length > 2 * 1024 * 1024:
                self._send_json(413, {"ok": False, "error": "Bild ist leer oder größer als 2 MB"})
                return

            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            is_event = image_endpoint == '/api/event-image'
            query_key = 'event' if is_event else 'station'
            fallback_id = 'event' if is_event else 'station'
            content_id = re.sub(r'[^a-zA-Z0-9_-]', '-', str((query.get(query_key) or [fallback_id])[0]))[:40] or fallback_id
            filename = f"{content_id}-{int(time.time())}-{secrets.token_hex(6)}.webp"
            image_data = self.rfile.read(length)
            if not image_data.startswith(b'RIFF') or image_data[8:12] != b'WEBP':
                self._send_json(400, {"ok": False, "error": "Ungültige WebP-Datei"})
                return
            target_dir = EVENT_IMAGE_DIR if is_event else STATION_IMAGE_DIR
            target_url_dir = 'events' if is_event else 'stations'
            with open(os.path.join(target_dir, filename), 'wb') as image_file:
                image_file.write(image_data)
            self._send_json(200, {"ok": True, "url": f"./downloads/{target_url_dir}/{filename}"})
            return

        if self.path == '/api/client-error':
            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
                self._send_json(400, {"ok": False, "error": "invalid_content_type"})
                return

            data = self._read_json()
            if not data or not isinstance(data, dict):
                self._send_json(400, {"ok": False, "error": "invalid_json"})
                return

            try:
                self._write_client_error_log(data)
                self._send_json(200, {"ok": True})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if self.path == '/api/bug-report':
            if not self._rate_limit():
                self._send_json(429, {"ok": False, "error": "rate_limited"})
                return

            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
                self._send_json(400, {"ok": False, "error": "invalid_content_type"})
                return

            data = self._read_json()
            if not data or not isinstance(data, dict):
                self._send_json(400, {"ok": False, "error": "invalid_json"})
                return

            subject = str(data.get('subject') or 'Feedback Lichternacht App').strip()[:200]
            text = str(data.get('text') or '').strip()
            if not text:
                self._send_json(400, {"ok": False, "error": "empty_text"})
                return
            if len(text) > 50_000:
                text = text[:50_000] + "\n\n[gekürzt]"
            html_content = str(data.get('html') or '').strip()
            if len(html_content) > 200_000:
                html_content = html_content[:200_000]

            try:
                self._send_bug_report_email(subject, text, html_content or None)
                self._send_json(200, {"ok": True})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/api/system-metrics':
            if not self._verify_admin_token():
                self._send_json(403, {"ok": False, "error": "Admin-Anmeldung ungültig"})
                return
            try:
                self._send_json(200, self._collect_system_metrics())
            except Exception:
                self._send_json(500, {"ok": False, "error": "Systemdaten konnten nicht gelesen werden"})
            return
        if self.path == '/api/health':
            self._send_json(200, {"ok": True})
            return
        return super().do_GET()

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

print(f"Server läuft auf http://{HOST}:{PORT}")
print(f"Uploads werden in '{UPLOAD_DIR}/' gespeichert.")

with ReusableTCPServer((HOST, PORT), CustomHandler) as httpd:
    httpd.serve_forever()
