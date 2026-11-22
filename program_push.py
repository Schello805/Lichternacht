"""Opt-in program push delivery; independent of the public application snapshot."""

import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import sqlite3
import threading
import time
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


BERLIN = ZoneInfo('Europe/Berlin')


def decode_key(value, size):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]+={0,2}', value):
        raise ValueError('Ungültiger Push-Schlüssel')
    decoded = base64.urlsafe_b64decode(value.rstrip('=') + '=' * (-len(value.rstrip('=')) % 4))
    if len(decoded) != size:
        raise ValueError('Ungültige Schlüssellänge')
    return decoded


def validate_endpoint(endpoint, resolve=False):
    if not isinstance(endpoint, str) or len(endpoint) > 2048 or any(ord(char) <= 32 or ord(char) >= 127 for char in endpoint):
        raise ValueError('Ungültiger Push-Endpunkt')
    parsed = urlsplit(endpoint)
    host = parsed.hostname or ''
    allowed = host in {'fcm.googleapis.com', 'updates.push.services.mozilla.com'} or any(
        host.endswith(suffix) and host != suffix[1:]
        for suffix in ('.push.apple.com', '.notify.windows.com'))
    if (parsed.scheme != 'https' or not allowed or parsed.username is not None
            or parsed.password is not None or parsed.port not in (None, 443)
            or parsed.fragment or not parsed.path.startswith('/') or '\\' in endpoint):
        raise ValueError('Nicht unterstützter Push-Anbieter')
    if not resolve:
        return host
    addresses = list(dict.fromkeys(result[4][0] for result in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)))
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError('Unsicheres Push-Ziel')
    return host, addresses[0]


class PinnedPushSession:
    def post(self, url, data=None, headers=None, timeout=10, **kwargs):
        import requests
        import urllib3

        host, address = validate_endpoint(url, resolve=True)
        parsed = urlsplit(url)
        target = parsed.path + ('?' + parsed.query if parsed.query else '')
        with urllib3.HTTPSConnectionPool(address, port=443, assert_hostname=host,
                                        server_hostname=host, cert_reqs='CERT_REQUIRED') as pool:
            result = pool.urlopen('POST', target, body=data, headers={**(headers or {}), 'Host': host},
                                  redirect=False, retries=False, timeout=urllib3.Timeout(connect=5, read=10),
                                  preload_content=False)
            try:
                response = requests.Response()
                response.status_code = result.status
                response.headers.update(result.headers)
                response._content = result.read(8192)
                response.url = url
                return response
            finally:
                result.close()


def event_schedule(snapshot):
    raw = str(snapshot.get('config', {}).get('downloads', {}).get('icsDate', '')).strip()
    match = re.fullmatch(r'(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}|\d{8})(?:\s+([0-2]?\d:[0-5]\d)\s*-\s*([0-2]?\d:[0-5]\d))?', raw)
    if not match:
        raise ValueError('Veranstaltungsdatum fehlt')
    date_value = match[1]
    date_format = '%d.%m.%Y' if '.' in date_value else '%Y-%m-%d' if '-' in date_value else '%Y%m%d'
    day = datetime.strptime(date_value, date_format).replace(tzinfo=BERLIN)
    start = datetime.combine(day.date(), datetime.strptime(match[2], '%H:%M').time(), BERLIN) if match[2] else day
    end = datetime.combine(day.date(), datetime.strptime(match[3], '%H:%M').time(), BERLIN) if match[3] else day + timedelta(days=1)
    if match[3] and end == start:
        raise ValueError('Ungültiges Veranstaltungsfenster')
    if end < start:
        end += timedelta(days=1)
    stations = {str(station.get('id')): station for station in snapshot.get('stations', [])}
    events = {}
    for event in snapshot.get('events', []):
        identifier = str(event.get('__docId', event.get('id', '')))
        clock = str(event.get('time', ''))
        linked = str(event.get('stationId') or '')
        if not identifier or not re.fullmatch(r'(?:[01]?\d|2[0-3]):[0-5]\d', clock) or event.get('cancelled') is True:
            continue
        if linked and (linked not in stations or stations[linked].get('cancelled') is True):
            continue
        instant = datetime.combine(day.date(), datetime.strptime(clock, '%H:%M').time(), BERLIN)
        if end.date() != start.date() and instant.time() <= end.time():
            instant += timedelta(days=1)
        utc = instant.timestamp()
        if datetime.fromtimestamp(utc, BERLIN).replace(fold=0) != instant.replace(fold=0):
            continue
        key = hashlib.sha256(f'{day.date()}:{identifier}:{utc}'.encode()).hexdigest()
        events[key] = {'start': utc, 'due': utc - 900, 'title': str(event.get('title') or 'Programmpunkt')[:120],
                       'location': str(event.get('loc') or stations.get(linked, {}).get('name') or '')[:120]}
    expiry = max((day + timedelta(days=1)).timestamp(), end.timestamp(),
                 max((event['start'] + 1 for event in events.values()), default=0))
    return events, expiry


class PushStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(descriptor)
        os.chmod(self.path, 0o600)
        with self.connect() as database:
            database.executescript('''
                CREATE TABLE IF NOT EXISTS subscriptions (
                    endpoint TEXT PRIMARY KEY, owner TEXT NOT NULL, subscription TEXT NOT NULL,
                    consent REAL NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs (
                    endpoint TEXT NOT NULL REFERENCES subscriptions(endpoint) ON DELETE CASCADE,
                    event_key TEXT NOT NULL, due REAL NOT NULL, expires REAL NOT NULL,
                    payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
                    attempts INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL,
                    lease REAL NOT NULL DEFAULT 0, claim TEXT,
                    PRIMARY KEY(endpoint, event_key));
                CREATE INDEX IF NOT EXISTS push_due ON jobs(state, next_attempt);
            ''')

    @contextmanager
    def connect(self):
        database = sqlite3.connect(self.path, timeout=10)
        database.row_factory = sqlite3.Row
        database.execute('PRAGMA foreign_keys=ON')
        try:
            with database:
                yield database
        finally:
            database.close()

    def subscribe(self, owner, subscription, expires, now):
        if not isinstance(subscription, dict):
            raise ValueError('Ungültiges Abonnement')
        endpoint = subscription.get('endpoint')
        validate_endpoint(endpoint)
        keys = subscription.get('keys')
        if not isinstance(keys, dict) or decode_key(keys.get('p256dh'), 65)[0] != 4:
            raise ValueError('Ungültiger Geräteschlüssel')
        from cryptography.hazmat.primitives.asymmetric import ec
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), decode_key(keys['p256dh'], 65))
        decode_key(keys.get('auth'), 16)
        browser_expiry = subscription.get('expirationTime')
        if browser_expiry is not None:
            if type(browser_expiry) not in (int, float) or not 0 < browser_expiry < float('inf'):
                raise ValueError('Ungültiges Ablaufdatum')
            expires = min(expires, browser_expiry / 1000)
        if expires <= now:
            raise ValueError('Abonnement ist abgelaufen')
        clean = {'endpoint': endpoint, 'keys': {'p256dh': keys['p256dh'], 'auth': keys['auth']}}
        with self.connect() as database:
            database.execute('BEGIN IMMEDIATE')
            database.execute('DELETE FROM subscriptions WHERE expires<=?', (now,))
            previous = database.execute('SELECT owner FROM subscriptions WHERE endpoint=?', (endpoint,)).fetchone()
            if previous and previous['owner'] != owner:
                raise PermissionError('Abonnement gehört einer anderen Sitzung')
            if not previous and database.execute('SELECT COUNT(*) FROM subscriptions WHERE owner=?', (owner,)).fetchone()[0] >= 10:
                raise ValueError('Zu viele Geräte-Abonnements')
            database.execute('''INSERT INTO subscriptions VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription,
                expires=MIN(subscriptions.expires, excluded.expires)''',
                (endpoint, owner, json.dumps(clean), now, expires))

    def active(self, owner, endpoint, now):
        with self.connect() as database:
            return bool(database.execute('SELECT 1 FROM subscriptions WHERE owner=? AND endpoint=? AND expires>?',
                                         (owner, endpoint, now)).fetchone())

    def unsubscribe(self, owner, endpoint):
        with self.connect() as database:
            database.execute('DELETE FROM subscriptions WHERE owner=? AND endpoint=?', (owner, endpoint))

    def reconcile(self, events, end, now):
        with self.connect() as database:
            database.execute('BEGIN IMMEDIATE')
            database.execute('DELETE FROM subscriptions WHERE expires<=?', (now,))
            database.execute('DELETE FROM jobs WHERE expires<=?', (now,))
            rows = database.execute('SELECT endpoint, event_key FROM jobs').fetchall()
            for row in rows:
                if row['event_key'] not in events:
                    database.execute('DELETE FROM jobs WHERE endpoint=? AND event_key=?', tuple(row))
            for key, event in events.items():
                if event['start'] <= now or now >= end:
                    continue
                payload = json.dumps({'type': 'program-reminder', 'title': 'Gleich geht’s los: ' + event['title'],
                                      'body': 'Beginn ' + datetime.fromtimestamp(event['start'], BERLIN).strftime('%H:%M') + ' Uhr · ' + event['location'], 'tag': 'program-' + key,
                                      'url': '/#events', 'expiresAt': event['start'] * 1000})
                database.execute('''INSERT OR IGNORE INTO jobs(endpoint, event_key, due, expires, payload, next_attempt)
                    SELECT endpoint, ?, ?, MIN(?, expires), ?, ? FROM subscriptions
                    WHERE consent<=? AND expires>?''',
                    (key, event['due'], event['start'], payload, event['due'], event['due'], now))
                database.execute("UPDATE jobs SET payload=? WHERE event_key=? AND state='pending'", (payload, key))

    def purge(self, now):
        with self.connect() as database:
            database.execute('DELETE FROM subscriptions WHERE expires<=?', (now,))
            database.execute('DELETE FROM jobs WHERE expires<=?', (now,))

    def claim(self, now):
        with self.connect() as database:
            database.execute('BEGIN IMMEDIATE')
            row = database.execute('''SELECT jobs.*, subscriptions.subscription FROM jobs JOIN subscriptions USING(endpoint)
                WHERE subscriptions.expires>? AND jobs.expires>? AND jobs.next_attempt<=? AND jobs.attempts<5
                AND (jobs.state='pending' OR (jobs.state='sending' AND jobs.lease<?))
                ORDER BY jobs.next_attempt LIMIT 1''', (now, now, now, now)).fetchone()
            if not row:
                return None
            claim = secrets.token_hex(16)
            database.execute("UPDATE jobs SET state='sending', attempts=attempts+1, lease=?, claim=? WHERE endpoint=? AND event_key=?",
                             (now + 120, claim, row['endpoint'], row['event_key']))
            return {**dict(row), 'claim': claim, 'attempts': row['attempts'] + 1}

    def still_claimed(self, job, now):
        with self.connect() as database:
            return bool(database.execute('''SELECT 1 FROM jobs JOIN subscriptions USING(endpoint)
                WHERE endpoint=? AND event_key=? AND claim=? AND jobs.expires>? AND subscriptions.expires>?''',
                (job['endpoint'], job['event_key'], job['claim'], now, now)).fetchone())

    def finish(self, job, status, now, retry_after=0):
        with self.connect() as database:
            if not database.execute('SELECT 1 FROM jobs WHERE endpoint=? AND event_key=? AND claim=?',
                                    (job['endpoint'], job['event_key'], job['claim'])).fetchone():
                return
            if status in (404, 410):
                database.execute('DELETE FROM subscriptions WHERE endpoint=?', (job['endpoint'],))
                return
            retry = status == 0 or status == 429 or status >= 500
            next_attempt = now + max(30 * 2 ** (job['attempts'] - 1), retry_after)
            state = 'sent' if 200 <= status < 300 else 'pending' if retry and job['attempts'] < 5 and next_attempt < job['expires'] else 'failed'
            database.execute('UPDATE jobs SET state=?, next_attempt=?, lease=0 WHERE endpoint=? AND event_key=? AND claim=?',
                             (state, next_attempt, job['endpoint'], job['event_key'], job['claim']))


class ProgramPush:
    def __init__(self, store, snapshot, sender):
        self.store, self.snapshot, self.sender = store, snapshot, sender
        self.stopping = threading.Event()
        self.thread = None

    def send(self, job):
        now = time.time()
        if self.stopping.is_set() or not self.store.still_claimed(job, now):
            return
        try:
            events, end = event_schedule(self.snapshot())
            if job['event_key'] not in events or now >= end:
                self.store.finish(job, 400, now)
                return
            response = self.sender(json.loads(job['subscription']), json.loads(job['payload']), max(0, int(job['expires'] - now)))
            status = response.status_code
            retry_after = response.headers.get('Retry-After', '0')
        except Exception as error:
            response = getattr(error, 'response', None)
            status = response.status_code if response is not None else 0
            retry_after = response.headers.get('Retry-After', '0') if response is not None else '0'
        try:
            delay = float(retry_after) if str(retry_after).isdigit() else parsedate_to_datetime(retry_after).timestamp() - time.time()
        except (ValueError, TypeError, OverflowError):
            delay = 0
        self.store.finish(job, status, time.time(), max(0, min(86400, delay)))

    def tick(self, executor):
        now = time.time()
        self.store.purge(now)
        events, end = event_schedule(self.snapshot())
        self.store.reconcile(events, end, now)
        jobs = []
        for _ in range(4):
            if self.stopping.is_set():
                break
            job = self.store.claim(now)
            if not job:
                break
            jobs.append(executor.submit(self.send, job))
        for job in jobs:
            job.result()

    def start(self):
        def run():
            with ThreadPoolExecutor(max_workers=4, thread_name_prefix='program-push-send') as executor:
                while not self.stopping.is_set():
                    try:
                        self.tick(executor)
                    except Exception:
                        print('Program Push: scheduler temporarily unavailable.', flush=True)
                    self.stopping.wait(10)
        self.thread = threading.Thread(target=run, name='program-push', daemon=True)
        self.thread.start()

    def stop(self):
        self.stopping.set()
        if self.thread:
            self.thread.join(timeout=30)


def configure_push(base, snapshot):
    if os.environ.get('PROGRAM_PUSH_ENABLED', '').lower() != 'true':
        return None
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from pywebpush import webpush

    private_dir = (Path(base) / '.private').resolve()
    key_path = Path(os.environ.get('PROGRAM_PUSH_PRIVATE_KEY_FILE', private_dir / 'push-vapid.pem')).resolve()
    database_path = Path(os.environ.get('PROGRAM_PUSH_DATABASE', private_dir / 'program-push.sqlite3')).resolve()
    for path in (key_path, database_path):
        if Path(base).resolve() in path.parents and private_dir not in path.parents:
            raise ValueError('Push-Dateien dürfen nicht im öffentlichen Webroot liegen')
    if key_path.stat().st_mode & 0o077:
        raise ValueError('Privater Schlüssel benötigt Dateimodus 0600')
    private_key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    if not isinstance(private_key, ec.EllipticCurvePrivateKey) or not isinstance(private_key.curve, ec.SECP256R1):
        raise ValueError('VAPID benötigt P-256')
    public_key = os.environ.get('PROGRAM_PUSH_PUBLIC_KEY', '')
    expected = private_key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    if decode_key(public_key, 65) != expected:
        raise ValueError('VAPID-Schlüsselpaar stimmt nicht überein')
    subject = os.environ.get('PROGRAM_PUSH_SUBJECT', '')
    if not re.fullmatch(r'mailto:[^\s@]+@[^\s@]+', subject):
        raise ValueError('VAPID-Kontakt fehlt')

    def sender(subscription, payload, ttl):
        return webpush(subscription_info=subscription, data=json.dumps(payload, ensure_ascii=False),
                       vapid_private_key=str(key_path), vapid_claims={'sub': subject}, ttl=ttl,
                       timeout=10, requests_session=PinnedPushSession())

    service = ProgramPush(PushStore(database_path), snapshot, sender)
    service.public_key = public_key
    return service
