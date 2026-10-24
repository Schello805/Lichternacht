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
import html
from email.message import EmailMessage
from email.utils import formataddr
from local_database import LocalDatabase

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get('BIND_HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '8000'))
UPLOAD_DIR = os.path.join(BASE_DIR, 'downloads')
STATION_IMAGE_DIR = os.path.join(UPLOAD_DIR, 'stations')
EVENT_IMAGE_DIR = os.path.join(UPLOAD_DIR, 'events')
FLYER_DIR = os.path.join(UPLOAD_DIR, 'flyers')
LOG_DIR = 'logs'
PRIVATE_DIR = os.path.join(BASE_DIR, '.private')
EMAIL_SETTINGS_PATH = os.path.join(PRIVATE_DIR, 'email-settings.json')

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)
if not os.path.exists(STATION_IMAGE_DIR):
    os.makedirs(STATION_IMAGE_DIR)
if not os.path.exists(EVENT_IMAGE_DIR):
    os.makedirs(EVENT_IMAGE_DIR)
if not os.path.exists(FLYER_DIR):
    os.makedirs(FLYER_DIR)
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)
if not os.path.exists(PRIVATE_DIR):
    os.makedirs(PRIVATE_DIR, mode=0o700)

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

LOCAL_DATABASE_ENABLED = os.environ.get('LOCAL_DATABASE_ENABLED', '').lower() == 'true'
LOCAL_DATABASE_PATH = os.environ.get('LOCAL_DATABASE_PATH', os.path.join(PRIVATE_DIR, 'local.sqlite3'))


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Permissions-Policy', 'geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Content-Security-Policy', "frame-ancestors 'self'; base-uri 'self'; object-src 'none'")
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

    def _rate_limit(self, bucket, limit, window_seconds):
        """Bound unauthenticated endpoints; a reverse proxy may opt in to trusted client IPs."""
        now = time.time()
        ip = self.client_address[0] if self.client_address else 'unknown'
        if os.environ.get('TRUST_PROXY_HEADERS', '').strip().lower() in ('1', 'true', 'yes', 'on'):
            forwarded = self.headers.get('X-Forwarded-For', '').split(',', 1)[0].strip()
            if forwarded:
                ip = forwarded[:64]
        try:
            store = getattr(self.server, "_rate_store", {})
            key = f'{bucket}:{ip}'
            recent = [stamp for stamp in store.get(key, []) if now - stamp < window_seconds]
            if len(recent) >= limit:
                return False
            recent.append(now)
            store[key] = recent
            setattr(self.server, "_rate_store", store)
        except Exception:
            pass
        return True

    @staticmethod
    def _feedback_html(message):
        escaped = html.escape(message).replace('\n', '<br>')
        return f'''<!doctype html>
<html lang="de"><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;">
<h1 style="font-size:20px;">Neues Feedback zur Lichternacht-App</h1>
<div style="padding:14px 16px;background:#fefce8;border:1px solid #fde68a;border-radius:12px;line-height:1.6;">{escaped}</div>
</body></html>'''

    def _email_settings(self):
        settings = {
            'recipient': os.environ.get('BUGREPORT_TO', 'admin@schellenberger.biz').strip(),
            'adminCc': os.environ.get('EMAIL_ADMIN_CC', '').strip(),
            'senderName': '',
            'fromEmail': os.environ.get('BUGREPORT_FROM', '').strip(),
            'smtpHost': os.environ.get('SMTP_HOST', '').strip(),
            'smtpUser': os.environ.get('SMTP_USER', '').strip(),
            'smtpPassword': os.environ.get('SMTP_PASS', '').strip(),
            'smtpPort': int(os.environ.get('SMTP_PORT', '587')),
            'smtpSsl': os.environ.get('SMTP_SSL', '').strip().lower() in ('1', 'true', 'yes', 'on')
        }
        try:
            with open(EMAIL_SETTINGS_PATH, 'r', encoding='utf-8') as settings_file:
                stored = json.load(settings_file)
            if isinstance(stored, dict):
                for key in ('recipient', 'adminCc', 'senderName', 'fromEmail', 'smtpHost', 'smtpUser', 'smtpPassword'):
                    value = str(stored.get(key) or '').strip()
                    if value:
                        settings[key] = value
                if isinstance(stored.get('smtpPort'), int) and 1 <= stored['smtpPort'] <= 65535:
                    settings['smtpPort'] = stored['smtpPort']
                if isinstance(stored.get('smtpSsl'), bool):
                    settings['smtpSsl'] = stored['smtpSsl']
        except (OSError, ValueError, TypeError):
            pass
        return settings

    def _save_email_settings(self, payload):
        try:
            with open(EMAIL_SETTINGS_PATH, 'r', encoding='utf-8') as settings_file:
                stored = json.load(settings_file)
            if not isinstance(stored, dict):
                stored = {}
        except (OSError, ValueError, TypeError):
            stored = {}
        stored.update(payload)
        temp_path = f'{EMAIL_SETTINGS_PATH}.{secrets.token_hex(6)}.tmp'
        with open(temp_path, 'w', encoding='utf-8') as settings_file:
            json.dump(stored, settings_file, ensure_ascii=False)
        os.chmod(temp_path, 0o600)
        os.replace(temp_path, EMAIL_SETTINGS_PATH)

    def _smtp_configured(self):
        settings = self._email_settings()
        return bool(settings['smtpHost'] and settings['smtpUser'] and settings['smtpPassword'])

    def _email_settings_payload(self):
        settings = self._email_settings()
        return {
            'ok': True,
            'recipient': settings['recipient'],
            'adminCc': settings['adminCc'],
            'senderName': settings['senderName'],
            'fromEmail': settings['fromEmail'],
            'smtpHost': settings['smtpHost'],
            'smtpPort': settings['smtpPort'],
            'smtpUser': settings['smtpUser'],
            'smtpSsl': settings['smtpSsl'],
            'smtpConfigured': self._smtp_configured(),
            'smtpPasswordConfigured': bool(settings['smtpPassword'])
        }

    def _send_bug_report_email(self, subject, text, html_content=None):
        settings = self._email_settings()
        to_addr = settings['recipient']
        from_addr = settings['fromEmail'] or to_addr

        host = settings['smtpHost']
        user = settings['smtpUser']
        password = settings['smtpPassword']
        port = settings['smtpPort']
        use_ssl = settings['smtpSsl']

        if not host or not user or not password:
            raise RuntimeError("SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)")

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = formataddr((settings['senderName'], from_addr)) if settings['senderName'] else from_addr
        msg['To'] = to_addr
        admin_cc = settings['adminCc']
        if admin_cc and admin_cc.lower() != to_addr.lower():
            msg['Cc'] = admin_cc
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
        self._verified_firebase_user = None
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
        self._verified_firebase_user = users[0] if users else None
        email = str(users[0].get('email') or '').strip().lower() if users else ''
        allowed = {
            item.strip().lower()
            for item in os.environ.get('ADMIN_EMAILS', '').split(',')
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
        if image_endpoint == '/api/local-data':
            if not LOCAL_DATABASE_ENABLED:
                return self._send_json(404, {'ok': False})
            is_admin = self._verify_admin_token()
            payload = self._read_json()
            if not isinstance(payload, dict):
                return self._send_json(400, {'ok': False, 'error': 'Ungültige Daten'})
            if not is_admin or payload.get('action') == 'like':
                user = self._verified_firebase_user
                if not user or payload.get('action') != 'like' or payload.get('collection') != 'stations':
                    return self._send_json(403, {'ok': False, 'error': 'Admin-Anmeldung ungültig'})
                if not self._rate_limit('local-like', 30, 60):
                    return self._send_json(429, {'ok': False, 'error': 'Zu viele Anfragen'})
                try:
                    LocalDatabase(LOCAL_DATABASE_PATH).like(str(user['localId']), str(payload.get('id', '')))
                    return self._send_json(200, {'ok': True})
                except Exception:
                    return self._send_json(400, {'ok': False, 'error': 'Bewertung konnte nicht gespeichert werden'})
            try:
                operations = payload.get('operations', [payload])
                LocalDatabase(LOCAL_DATABASE_PATH).write_many(operations)
                return self._send_json(200, {'ok': True})
            except ValueError as error:
                return self._send_json(400, {'ok': False, 'error': str(error)})
            except Exception:
                return self._send_json(503, {'ok': False, 'error': 'Lokale Datenbank nicht verfügbar'})
        if image_endpoint == '/api/flyer-pdf':
            if not self._verify_admin_token():
                self._send_json(403, {"ok": False, "error": "Admin-Anmeldung ungültig"})
                return
            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/pdf':
                self._send_json(400, {"ok": False, "error": "Nur PDF-Dateien sind erlaubt"})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            if length <= 0 or length > 20 * 1024 * 1024:
                self._send_json(413, {"ok": False, "error": "PDF ist leer oder größer als 20 MB"})
                return
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            slot = str((query.get('slot') or [''])[0]).strip()
            if slot not in ('flyer1', 'flyer2'):
                self._send_json(400, {"ok": False, "error": "Flyer-Platz ungültig"})
                return
            pdf_data = self.rfile.read(length)
            if not pdf_data.startswith(b'%PDF-'):
                self._send_json(400, {"ok": False, "error": "Ungültige PDF-Datei"})
                return
            filename = f"{slot}-{int(time.time())}-{secrets.token_hex(6)}.pdf"
            with open(os.path.join(FLYER_DIR, filename), 'wb') as flyer_file:
                flyer_file.write(pdf_data)
            self._send_json(200, {"ok": True, "url": f"/downloads/flyers/{filename}"})
            return
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
            self._send_json(200, {"ok": True, "url": f"/downloads/{target_url_dir}/{filename}"})
            return

        if image_endpoint == '/api/email-settings':
            if not self._verify_admin_token():
                return self._send_json(403, {'ok': False, 'error': 'Admin-Anmeldung ungültig'})
            data = self._read_json()
            if not isinstance(data, dict):
                return self._send_json(400, {'ok': False, 'error': 'Ungültige E-Mail-Einstellungen'})
            action = str(data.get('action') or 'save').strip()
            if action == 'save':
                recipient = str(data.get('recipient') or '').strip().lower()
                admin_cc = str(data.get('adminCc') or '').strip().lower()
                sender_name = str(data.get('senderName') or '').strip()
                from_email = str(data.get('fromEmail') or '').strip().lower()
                smtp_host = str(data.get('smtpHost') or '').strip()
                smtp_user = str(data.get('smtpUser') or '').strip()
                smtp_password = str(data.get('smtpPassword') or '')
                try:
                    smtp_port = int(data.get('smtpPort') or 587)
                except (TypeError, ValueError):
                    smtp_port = 0
                smtp_ssl = bool(data.get('smtpSsl'))
                if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', recipient):
                    return self._send_json(400, {'ok': False, 'error': 'Bitte eine gültige Empfängeradresse eingeben'})
                if admin_cc and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', admin_cc):
                    return self._send_json(400, {'ok': False, 'error': 'Bitte eine gültige CC-Adresse eingeben'})
                if from_email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', from_email):
                    return self._send_json(400, {'ok': False, 'error': 'Bitte eine gültige Absenderadresse eingeben'})
                if len(sender_name) > 80 or '\n' in sender_name or '\r' in sender_name:
                    return self._send_json(400, {'ok': False, 'error': 'Absendername ist ungültig'})
                if smtp_host and not re.fullmatch(r'[A-Za-z0-9.-]{1,255}', smtp_host):
                    return self._send_json(400, {'ok': False, 'error': 'SMTP-Host ist ungültig'})
                if smtp_port < 1 or smtp_port > 65535:
                    return self._send_json(400, {'ok': False, 'error': 'SMTP-Port ist ungültig'})
                if len(smtp_user) > 320 or len(smtp_password) > 1000:
                    return self._send_json(400, {'ok': False, 'error': 'SMTP-Zugangsdaten sind ungültig'})
                existing = self._email_settings()
                has_smtp_update = bool(smtp_host or smtp_user or smtp_password)
                if has_smtp_update and not (smtp_host and smtp_user and (smtp_password or existing['smtpPassword'])):
                    return self._send_json(400, {'ok': False, 'error': 'Für SMTP bitte Host, Benutzername und Passwort eingeben'})
                payload = {
                    'recipient': recipient,
                    'adminCc': admin_cc,
                    'senderName': sender_name,
                    'fromEmail': from_email,
                    'smtpPort': smtp_port,
                    'smtpSsl': smtp_ssl
                }
                if smtp_host:
                    payload['smtpHost'] = smtp_host
                if smtp_user:
                    payload['smtpUser'] = smtp_user
                if smtp_password:
                    payload['smtpPassword'] = smtp_password
                try:
                    self._save_email_settings(payload)
                    return self._send_json(200, self._email_settings_payload())
                except OSError:
                    return self._send_json(500, {'ok': False, 'error': 'E-Mail-Einstellungen konnten nicht gespeichert werden'})
            if action == 'test':
                if not self._smtp_configured():
                    return self._send_json(400, {'ok': False, 'error': 'SMTP ist auf dem Server noch nicht eingerichtet'})
                try:
                    self._send_bug_report_email(
                        'Lichternacht App – SMTP-Test',
                        'Diese Testmail bestätigt, dass der E-Mail-Versand der Lichternacht App funktioniert.'
                    )
                    return self._send_json(200, {'ok': True})
                except Exception:
                    return self._send_json(500, {'ok': False, 'error': 'Testmail konnte nicht gesendet werden'})
            return self._send_json(400, {'ok': False, 'error': 'Unbekannte Aktion'})

        if self.path == '/api/client-error':
            if not self._rate_limit('client-error', 10, 600):
                self._send_json(429, {"ok": False, "error": "rate_limited"})
                return
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
            if not self._rate_limit('bug-report', 3, 600):
                self._send_json(429, {"ok": False, "error": "rate_limited"})
                return

            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
                self._send_json(400, {"ok": False, "error": "invalid_content_type"})
                return

            data = self._read_json()
            if not data or not isinstance(data, dict):
                self._send_json(400, {"ok": False, "error": "invalid_json"})
                return

            text = str(data.get('text') or '').strip()
            if not text:
                self._send_json(400, {"ok": False, "error": "empty_text"})
                return
            if len(text) > 10_000:
                text = text[:10_000] + "\n\n[gekürzt]"

            try:
                self._send_bug_report_email('Feedback Lichternacht App', text, self._feedback_html(text))
                self._send_json(200, {"ok": True})
            except Exception:
                self._send_json(500, {"ok": False, "error": "Feedback konnte nicht versendet werden"})
            return

        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/local-admin':
            if not LOCAL_DATABASE_ENABLED:
                return self._send_json(404, {'ok': False})
            return self._send_json(200, {'ok': True, 'isAdmin': self._verify_admin_token()})
        if parsed_path.path == '/api/local-data':
            if not LOCAL_DATABASE_ENABLED:
                return self._send_json(404, {'ok': False})
            try:
                snapshot = LocalDatabase(LOCAL_DATABASE_PATH).read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'appId': snapshot.get('appId'), 'stations': snapshot['stations'], 'events': snapshot['events'], 'config': snapshot['config']}).encode('utf-8'))
                return
            except Exception:
                return self._send_json(503, {'ok': False, 'error': 'Lokale Datenbank nicht verfügbar'})
        requested_path = urllib.parse.unquote(parsed_path.path)
        path_segments = [segment for segment in requested_path.split('/') if segment]
        protected_paths = {'logs', 'node_modules', 'scripts', 'server', 'tests'}
        protected_files = {
            '/server.py', '/deploy.sh', '/firebase.json', '/firestore.rules',
            '/package.json', '/package-lock.json', '/playwright.config.js',
            '/tailwind.config.js', '/server-htaccess', '/local_database.py'
        }

        if (
            any(segment.startswith('.') for segment in path_segments)
            or (path_segments and path_segments[0] in protected_paths)
            or requested_path in protected_files
        ):
            self.send_error(404)
            return

        if parsed_path.path == '/api/email-settings':
            if not self._verify_admin_token():
                return self._send_json(403, {'ok': False, 'error': 'Admin-Anmeldung ungültig'})
            return self._send_json(200, self._email_settings_payload())
        if parsed_path.path == '/api/google-sheet':
            if not self._verify_admin_token():
                return self._send_json(401, {'error': 'Admin-Anmeldung ungültig'})
            params = urllib.parse.parse_qs(parsed_path.query)
            sheet_id = str((params.get('id') or [''])[0]).strip()
            sheet_name = str((params.get('sheet') or [''])[0]).strip()
            if not re.fullmatch(r'[A-Za-z0-9_-]{20,100}', sheet_id) or not sheet_name or len(sheet_name) > 80:
                return self._send_json(400, {'error': 'Google-Sheets-Link oder Tabellenblatt ungültig'})
            source_url = (
                'https://docs.google.com/spreadsheets/d/' + urllib.parse.quote(sheet_id, safe='') +
                '/gviz/tq?tqx=out:csv&sheet=' + urllib.parse.quote(sheet_name, safe='')
            )
            request = urllib.request.Request(source_url, headers={'User-Agent': 'Lichternacht-Sync/1.0'})
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    csv_data = response.read(2_000_000)
            except (urllib.error.URLError, urllib.error.HTTPError):
                return self._send_json(502, {'error': 'Google Sheet nicht erreichbar. Bitte im Web veröffentlichen.'})
            if csv_data.lstrip().lower().startswith((b'<!doctype', b'<html')):
                return self._send_json(502, {'error': 'Google liefert keine Tabelle. Bitte das Sheet im Web veröffentlichen.'})
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(csv_data)
            return
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

class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

print(f"Server läuft auf http://{HOST}:{PORT}")
print(f"Uploads werden in '{UPLOAD_DIR}/' gespeichert.")

with ReusableTCPServer((HOST, PORT), CustomHandler) as httpd:
    httpd.serve_forever()
