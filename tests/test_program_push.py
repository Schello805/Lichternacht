import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from program_push import BERLIN, PushStore, ProgramPush, configure_push, event_schedule, validate_endpoint
import server


class ProgramPushTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = PushStore(Path(self.directory.name) / 'push.sqlite3')
        public = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b'=').decode()
        self.subscription = {'endpoint': 'https://fcm.googleapis.com/fcm/send/test', 'keys': {'p256dh': encode(public), 'auth': encode(bytes(range(16)))}}
        self.snapshot = {'config': {'downloads': {'icsDate': '21.11.2099 17:00-21:00'}}, 'stations': [{'id': 1, 'cancelled': True}], 'events': [
            {'id': 'opening', 'time': '16:30', 'title': 'Opening'}, {'id': 'show', 'time': '21:00', 'title': 'Show'},
            {'id': 'cancelled', 'time': '18:00', 'stationId': '1'}, {'id': 'no', 'time': '18:00', 'cancelled': True}
        ]}
        self.events, self.end = event_schedule(self.snapshot)
        self.due = min(event['due'] for event in self.events.values())

    def test_schedule_includes_opening_and_end_slot_and_excludes_cancellations(self):
        self.assertEqual({event['title'] for event in self.events.values()}, {'Opening', 'Show'})
        opening = min(self.events.values(), key=lambda event: event['start'])
        self.assertEqual(datetime.fromtimestamp(opening['start'], BERLIN).hour, 16)
        self.assertGreater(self.end, max(event['start'] for event in self.events.values()))

    def test_endpoint_validation_blocks_internal_hosts_credentials_ports_and_redirect_targets(self):
        for endpoint in ['http://fcm.googleapis.com/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.test/a', 'https://user@fcm.googleapis.com/a', 'https://fcm.googleapis.com:8443/a', 'https://evil.test/a']:
            with self.assertRaises(ValueError):
                validate_endpoint(endpoint)
        with patch('program_push.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaises(ValueError):
                validate_endpoint(self.subscription['endpoint'], resolve=True)

    def test_ownership_crypto_validation_and_minimal_storage(self):
        self.store.subscribe('owner', {**self.subscription, 'lat': 49}, self.end, self.due - 1)
        with self.assertRaises(PermissionError):
            self.store.subscribe('other', self.subscription, self.end, self.due - 1)
        with self.assertRaises(ValueError):
            self.store.subscribe('owner', {**self.subscription, 'keys': {'p256dh': 'A' * 87, 'auth': 'bad'}}, self.end, self.due)
        self.assertTrue(self.store.active('owner', self.subscription['endpoint'], self.due))
        with self.store.connect() as database:
            record = json.loads(database.execute('SELECT subscription FROM subscriptions').fetchone()[0])
        self.assertEqual(set(record), {'endpoint', 'keys'})
        self.store.unsubscribe('other', self.subscription['endpoint'])
        self.assertTrue(self.store.active('owner', self.subscription['endpoint'], self.due))

    def test_persistent_deduplication_retries_and_withdrawal_cascade(self):
        self.store.subscribe('owner', self.subscription, self.end, self.due - 1)
        self.store.reconcile(self.events, self.end, self.due)
        self.store.reconcile(self.events, self.end, self.due)
        job = self.store.claim(self.due)
        self.assertIsNotNone(job)
        self.assertIsNone(self.store.claim(self.due))
        self.store.finish(job, 503, self.due)
        self.assertIsNone(self.store.claim(self.due + 29))
        retry = self.store.claim(self.due + 30)
        self.assertEqual(retry['attempts'], 2)
        self.store.finish(retry, 201, self.due + 30)
        self.assertIsNone(PushStore(self.store.path).claim(self.due + 31))
        self.store.unsubscribe('owner', self.subscription['endpoint'])
        with self.store.connect() as database:
            self.assertEqual(database.execute('SELECT count(*) FROM jobs').fetchone()[0], 0)

    def test_expired_endpoints_and_event_changes_do_not_send(self):
        self.store.subscribe('owner', self.subscription, self.end, self.due - 1)
        self.store.reconcile(self.events, self.end, self.due)
        job = self.store.claim(self.due)
        sent = []
        service = ProgramPush(self.store, lambda: {**self.snapshot, 'events': []}, lambda *args: sent.append(args))
        with patch('program_push.time.time', return_value=self.due):
            service.send(job)
        self.assertEqual(sent, [])
        self.store.reconcile(self.events, self.end, self.due)
        self.store.purge(self.end + 1)
        self.assertFalse(self.store.active('owner', self.subscription['endpoint'], self.end + 1))

    def test_scheduler_delivers_without_a_browser_and_never_after_start(self):
        self.store.subscribe('owner', self.subscription, self.end, self.due - 1)
        sent = []
        service = ProgramPush(self.store, lambda: self.snapshot, lambda subscription, payload, ttl: (sent.append((payload, ttl)) or SimpleNamespace(status_code=201, headers={})))
        with patch('program_push.time.time', return_value=self.due), ThreadPoolExecutor(max_workers=4) as executor:
            service.tick(executor)
            service.tick(executor)
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0][1], 900)
        self.assertNotIn('lat', sent[0][0])
        with patch('program_push.time.time', return_value=self.end), ThreadPoolExecutor(max_workers=4) as executor:
            service.tick(executor)
        self.assertEqual(len(sent), 1)

    def test_api_requires_verified_user_origin_and_explicit_scope(self):
        service = SimpleNamespace(store=self.store, snapshot=lambda: self.snapshot, public_key='public')
        def send(action, body, user='owner', origin='https://lichternacht-bechhofen.de'):
            handler = object.__new__(server.CustomHandler)
            handler.server = SimpleNamespace(program_push=service)
            handler.headers = {'Origin': origin}
            handler._local_user = lambda: {'uid': user} if user else None
            handler._rate_limit = lambda *args: True
            handler._read_json = lambda: body
            response = []
            handler._send_json = lambda status, data: response.append((status, data))
            handler._program_push(action)
            return response[0][0]
        body = {'subscription': self.subscription, 'consent': True, 'scope': 'all-program-events'}
        with patch.object(server, 'LOCAL_AUTH_ENABLED', True):
            self.assertEqual(send('subscribe', body, user=None), 401)
            self.assertEqual(send('subscribe', body, origin='https://evil.test'), 403)
            self.assertEqual(send('subscribe', {**body, 'consent': False}), 400)
            self.assertEqual(send('subscribe', body), 200)
            self.assertEqual(send('unsubscribe', {'endpoint': self.subscription['endpoint']}), 200)

    def test_key_generation_configuration_permissions_and_no_overwrite(self):
        root = Path(__file__).resolve().parents[1]
        key = Path(self.directory.name) / 'vapid.pem'
        command = [sys.executable, str(root / 'scripts/generate-push-vapid.py'), '--private-key', str(key)]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        settings = dict(line.split('=', 1) for line in result.stdout.splitlines())
        self.assertNotIn('PRIVATE KEY-----', result.stdout)
        self.assertEqual(key.stat().st_mode & 0o777, 0o600)
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
        settings.update(PROGRAM_PUSH_ENABLED='true', PROGRAM_PUSH_DATABASE=str(self.store.path), PROGRAM_PUSH_SUBJECT='mailto:operator@example.test')
        with patch.dict(os.environ, settings):
            service = configure_push(root, lambda: self.snapshot)
            self.assertEqual(service.public_key, settings['PROGRAM_PUSH_PUBLIC_KEY'])
            key.chmod(0o644)
            with self.assertRaises(ValueError):
                configure_push(root, lambda: self.snapshot)
