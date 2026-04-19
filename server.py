import http.server
import socketserver
import os
import cgi
import json
import time
import smtplib
import ssl
from email.message import EmailMessage

HOST = os.environ.get('BIND_HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '8000'))
UPLOAD_DIR = 'downloads'

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

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

    def _send_bug_report_email(self, subject, text):
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

    def do_POST(self):
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

            try:
                self._send_bug_report_email(subject, text)
                self._send_json(200, {"ok": True})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if self.path == '/upload':
            try:
                content_type, pdict = cgi.parse_header(self.headers['content-type'])
                if content_type == 'multipart/form-data':
                    pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
                    fields = cgi.parse_multipart(self.rfile, pdict)
                    
                    # Get file data
                    # Note: This simple parser might behave differently depending on python version/environment
                    # For robustness in a simple script, we assume standard multipart
                    
                    files = fields.get('file')
                    filenames = fields.get('filename') # Sometimes filename is separate or in the object
                    
                    # cgi.parse_multipart is tricky with binary files in newer python versions
                    # Let's use a more robust approach with cgi.FieldStorage for the file
                    
                    form = cgi.FieldStorage(
                        fp=self.rfile,
                        headers=self.headers,
                        environ={'REQUEST_METHOD': 'POST',
                                 'CONTENT_TYPE': self.headers['Content-Type'],
                                 }
                    )
                    
                    if 'file' in form:
                        fileitem = form['file']
                        if fileitem.filename:
                            fn = os.path.basename(fileitem.filename)
                            save_path = os.path.join(UPLOAD_DIR, fn)
                            with open(save_path, 'wb') as f:
                                f.write(fileitem.file.read())
                            
                            self.send_response(200)
                            self.send_header('Content-type', 'application/json')
                            self.end_headers()
                            self.wfile.write(bytes(f'{{"url": "{UPLOAD_DIR}/{fn}"}}', 'utf-8'))
                            return

            except Exception as e:
                print(e)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(bytes(f'{{"error": "{str(e)}"}}', 'utf-8'))
                return
        
        self.send_response(404)
        self.end_headers()

print(f"Server läuft auf http://{HOST}:{PORT}")
print(f"Uploads werden in '{UPLOAD_DIR}/' gespeichert.")

with socketserver.TCPServer((HOST, PORT), CustomHandler) as httpd:
    httpd.serve_forever()
