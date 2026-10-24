import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import server
from local_auth import LocalAuth


class LocalAuthHttpTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / '.private' / 'auth.sqlite3'
        self.auth = LocalAuth(self.path)
        self.admin = self.auth.create_admin('admin@example.test', 'Test-password-1234', uid='original-admin')
        for name, value in [('LOCAL_AUTH_ENABLED', True), ('LOCAL_DATABASE_ENABLED', True), ('LOCAL_AUTH_PATH', str(self.path))]:
            setting = patch.object(server, name, value)
            setting.start()
            self.addCleanup(setting.stop)

    def handler(self, path, data=None, cookie='', origin=True):
        handler = object.__new__(server.CustomHandler)
        handler.path = path
        handler.headers = {'Cookie': cookie, 'Content-Type': 'application/json'}
        if origin:
            handler.headers['Origin'] = server.LOCAL_AUTH_ORIGIN
        handler.wfile = io.BytesIO()
        handler.responses = []
        handler.sent_headers = []
        handler.send_response = lambda status: setattr(handler, 'status', status)
        handler.send_header = lambda name, value: handler.sent_headers.append((name, value))
        handler.end_headers = lambda: None
        handler._send_json = lambda status, payload: handler.responses.append((status, payload))
        handler._read_json = lambda: data
        handler._rate_limit = lambda *args: True
        return handler

    def test_login_sets_http_only_cookie_without_returning_token(self):
        handler = self.handler('/api/local-auth/login', {'email': 'admin@example.test', 'password': 'Test-password-1234'})
        handler.do_POST()
        self.assertEqual(handler.status, 200)
        payload = json.loads(handler.wfile.getvalue())
        self.assertEqual(payload['user']['uid'], 'original-admin')
        self.assertNotIn('token', payload)
        cookies = [value for name, value in handler.sent_headers if name == 'Set-Cookie']
        self.assertEqual(len(cookies), 1)
        for attribute in ('HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/'):
            self.assertIn(attribute, cookies[0])
        authenticated = self.handler('/api/local-admin', cookie=cookies[0].split(';')[0])
        with patch.object(server.urllib.request, 'urlopen', side_effect=AssertionError('Unexpected Firebase request')):
            self.assertTrue(authenticated._verify_admin_token())

    def test_browser_writes_reject_missing_or_foreign_origin(self):
        for origin in ('', 'https://attacker.example'):
            handler = self.handler('/api/local-auth/anonymous', {}, origin=False)
            if origin:
                handler.headers['Origin'] = origin
            handler.do_POST()
            self.assertEqual(handler.responses[0][0], 403)

    def test_anonymous_claims_and_firebase_bearer_never_grant_local_admin(self):
        session = self.auth.anonymous()
        handler = self.handler('/api/local-admin', cookie=server.AUTH_COOKIE + '=' + session['token'])
        handler.headers['Authorization'] = 'Bearer external-firebase-admin-token'
        with patch.object(server.urllib.request, 'urlopen', side_effect=AssertionError('Unexpected Firebase request')):
            self.assertFalse(handler._verify_admin_token())
            self.assertEqual(handler._verified_firebase_user['localId'], session['user']['uid'])
        handler = self.handler('/api/local-auth/create-admin', {'email': 'attacker@example.test', 'password': 'Test-password-1234'})
        handler.do_POST()
        self.assertEqual(handler.responses[0][0], 403)

    def test_logout_revokes_admin_cookie(self):
        session = self.auth.login('admin@example.test', 'Test-password-1234')
        handler = self.handler('/api/local-auth/logout', {}, server.AUTH_COOKIE + '=' + session['token'])
        handler.do_POST()
        self.assertIsNone(self.auth.get_user(session['token']))
        self.assertTrue(any('Max-Age=0' in value for name, value in handler.sent_headers if name == 'Set-Cookie'))

    def test_disabled_local_auth_has_no_public_bootstrap(self):
        with patch.object(server, 'LOCAL_AUTH_ENABLED', False):
            handler = self.handler('/api/local-auth/login', {})
            handler.do_POST()
            self.assertEqual(handler.responses[0][0], 404)

    def test_reset_response_does_not_disclose_account_or_token(self):
        class ImmediateThread:
            def __init__(self, target, **kwargs):
                self.target = target

            def start(self):
                self.target()

        messages = []
        results = []
        with patch.object(server.threading, 'Thread', ImmediateThread):
            for email in ('admin@example.test', 'unknown@example.test'):
                handler = self.handler('/api/local-auth/request-reset', {'email': email})
                handler._send_bug_report_email = lambda *args, **kwargs: messages.append((args, kwargs))
                handler.do_POST()
                results.append(handler.responses[0])
        self.assertEqual(results, [(200, {'ok': True}), (200, {'ok': True})])
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0][1]['recipient'], 'admin@example.test')
        self.assertFalse(messages[0][1]['include_admin_cc'])
        self.assertIn('/#reset-password=', messages[0][0][1])


if __name__ == '__main__':
    unittest.main()
