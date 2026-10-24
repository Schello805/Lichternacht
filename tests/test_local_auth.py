import concurrent.futures
import importlib.util
import json
import sqlite3
import tempfile
import time
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from local_auth import LocalAuth


class LocalAuthTests(unittest.TestCase):
    def test_backup_preserves_credentials_without_reviving_sessions_or_resets(self):
        email = self.user['email']
        self.auth.set_admin_password(email, 'Initial-password-1234')
        session = self.auth.login(email, 'Initial-password-1234')
        reset = self.auth.issue_reset(email)
        destination = self.path.parent / 'backup.sqlite3'
        self.auth.backup(destination)
        restored = LocalAuth(destination)
        self.assertIsNotNone(restored.login(email, 'Initial-password-1234'))
        self.assertIsNone(restored.get_user(session['token']))
        self.assertIsNone(restored.reset_password(reset['token'], 'Replacement-password-1234'))
        self.assertIsNotNone(self.auth.get_user(session['token']))
        with self.assertRaises(FileExistsError):
            self.auth.backup(destination)

    def test_slow_login_does_not_block_sessions_and_rechecks_changed_password(self):
        email = self.user['email']
        self.auth.set_admin_password(email, 'Initial-password-1234')
        session = self.auth.login(email, 'Initial-password-1234')
        started = threading.Event()
        release = threading.Event()
        original_hash = self.auth._hash

        def delayed_hash(password, salt):
            if threading.current_thread().name.startswith('slow-login'):
                started.set()
                release.wait(5)
            return original_hash(password, salt)

        with patch.object(self.auth, '_hash', delayed_hash), concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix='slow-login') as executor:
            login = executor.submit(self.auth.login, email, 'Initial-password-1234')
            try:
                self.assertTrue(started.wait(2))
                self.assertIsNotNone(self.auth.get_user(session['token']))
                self.auth.set_admin_password(email, 'Replacement-password-1234')
            finally:
                release.set()
            self.assertIsNone(login.result(timeout=5))

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / '.private' / 'auth.sqlite3'
        self.auth = LocalAuth(self.path)
        self.user = self.auth.create_admin('Admin@example.org', 'correct horse battery', uid='firebase-existing-uid')

    def test_login_and_persistence(self):
        session = self.auth.login('ADMIN@example.org', 'correct horse battery')
        self.assertEqual(session['user'], self.user)
        self.assertEqual(self.user['uid'], 'firebase-existing-uid')
        self.assertTrue(self.user['isAdmin'])
        self.assertEqual(LocalAuth(self.path).get_user(session['token']), self.user)
        self.assertAlmostEqual(session['expiresAt'] - time.time(), 43200, delta=2)
        self.assertIsNone(self.auth.login('admin@example.org', 'wrong'))
        self.assertIsNone(self.auth.login('absent@example.org', 'wrong'))
        with sqlite3.connect(self.path) as database:
            stored = database.execute('SELECT digest FROM auth_sessions').fetchone()[0]
            salt, password_hash = database.execute('SELECT salt,password_hash FROM auth_users').fetchone()
        self.assertNotEqual(stored, session['token'])
        self.assertEqual(len(salt), 16)
        self.assertEqual(len(password_hash), 32)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_anonymous_and_logout(self):
        first = self.auth.anonymous()
        second = self.auth.anonymous()
        self.assertNotEqual(first['user']['uid'], second['user']['uid'])
        self.assertTrue(first['user']['uid'].startswith('anon_'))
        self.assertTrue(first['user']['isAnonymous'])
        self.assertFalse(self.auth.get_user(first['token'])['isAdmin'])
        self.assertAlmostEqual(first['expiresAt'] - time.time(), 2592000, delta=2)
        self.auth.logout(first['token'])
        self.auth.logout(first['token'])
        self.assertIsNone(self.auth.get_user(first['token']))
        with self.assertRaises(ValueError):
            self.auth.create_admin('another@example.org', 'correct horse battery', uid=second['user']['uid'])

    def test_expiration_and_cleanup(self):
        session = self.auth.login('admin@example.org', 'correct horse battery')
        reset = self.auth.issue_reset('admin@example.org')
        with patch('local_auth.time.time', return_value=session['expiresAt']):
            self.assertIsNone(self.auth.get_user(session['token']))
            self.assertIsNone(self.auth.reset_password(reset['token'], 'replacement password'))
        with sqlite3.connect(self.path) as database:
            self.assertEqual(database.execute('SELECT count(*) FROM auth_sessions').fetchone()[0], 0)
            self.assertEqual(database.execute('SELECT count(*) FROM auth_resets').fetchone()[0], 0)
        anonymous = self.auth.anonymous()
        with patch('local_auth.time.time', return_value=anonymous['expiresAt']):
            self.assertIsNone(self.auth.get_user(anonymous['token']))

    def test_reset_single_use_and_revocation(self):
        sessions = [self.auth.login('admin@example.org', 'correct horse battery') for _ in range(2)]
        first = self.auth.issue_reset('admin@example.org')
        second = self.auth.issue_reset('admin@example.org')
        self.assertIsNone(self.auth.reset_password(first['token'], 'replacement password'))
        self.assertEqual(self.auth.reset_password(second['token'], 'replacement password'), self.user)
        self.assertIsNone(self.auth.reset_password(second['token'], 'replacement password'))
        for session in sessions:
            self.assertIsNone(self.auth.get_user(session['token']))
        self.assertIsNone(self.auth.login('admin@example.org', 'correct horse battery'))
        self.assertIsNotNone(self.auth.login('admin@example.org', 'replacement password'))
        self.assertIsNone(self.auth.issue_reset('unknown@example.org'))

    def test_offline_recovery(self):
        session = self.auth.login('admin@example.org', 'correct horse battery')
        reset = self.auth.issue_reset('admin@example.org')
        self.assertEqual(self.auth.set_admin_password('admin@example.org', 'recovered password'), self.user)
        self.assertIsNone(self.auth.get_user(session['token']))
        self.assertIsNone(self.auth.reset_password(reset['token'], 'replacement password'))
        self.assertIsNotNone(self.auth.login('admin@example.org', 'recovered password'))

    def test_reset_expiration_and_dedicated_database(self):
        reset = self.auth.issue_reset('admin@example.org')
        with patch('local_auth.time.time', return_value=reset['expiresAt']):
            self.assertIsNone(self.auth.reset_password(reset['token'], 'replacement password'))
        other_path = self.path.parent / 'data.sqlite3'
        with sqlite3.connect(other_path) as database:
            database.execute('CREATE TABLE documents (id TEXT)')
        with self.assertRaises(ValueError):
            LocalAuth(other_path)

    def test_malformed_inputs(self):
        for value in (None, 1, {}, '', 'x' * 10000, 'bad\x00@example.org', '\ud800@example.org', 'no-address'):
            with self.subTest(value=str(value)[:30]), self.assertRaises(ValueError):
                self.auth.login(value, 'password')
        for value in (None, 1, {}, '', 'x' * 1025, '\ud800'):
            with self.subTest(password=str(value)[:30]), self.assertRaises(ValueError):
                self.auth.login('admin@example.org', value)
        for method in (self.auth.get_user, self.auth.logout):
            for value in (None, 1, {}, '', 'x' * 10000, '/' * 43):
                with self.assertRaises(ValueError):
                    method(value)
        with self.assertRaises(ValueError):
            self.auth.create_admin('new@example.org', 'short')
        with self.assertRaises(ValueError):
            self.auth.create_admin('admin@example.org', 'replacement password')
        with self.assertRaises(ValueError):
            LocalAuth(Path(self.temporary.name) / 'data.sqlite')

    def test_concurrent_reset_consumption(self):
        reset = self.auth.issue_reset('admin@example.org')
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _: LocalAuth(self.path).reset_password(reset['token'], 'replacement password'), range(4)))
        self.assertEqual(sum(result is not None for result in results), 1)

    def test_lookup_and_admin_deletion(self):
        self.assertEqual(self.auth.get_user_by_email('ADMIN@example.org'), self.user)
        self.assertIsNone(self.auth.get_user_by_email('unknown@example.org'))
        with self.assertRaises(ValueError):
            self.auth.delete_admin(self.user['uid'], self.user['uid'])
        with self.assertRaises(ValueError):
            self.auth.delete_admin(self.user['uid'], self.auth.anonymous()['user']['uid'])
        other = self.auth.create_admin('second@example.org', 'second admin password', uid='second-uid')
        session = self.auth.login('second@example.org', 'second admin password')
        reset = self.auth.issue_reset('second@example.org')
        self.assertTrue(self.auth.delete_admin(other['uid'], self.user['uid']))
        self.assertFalse(self.auth.delete_admin(other['uid'], self.user['uid']))
        self.assertIsNone(self.auth.get_user(session['token']))
        self.assertIsNone(self.auth.reset_password(reset['token'], 'replacement password'))
        self.assertIsNone(self.auth.login('second@example.org', 'second admin password'))
        with self.assertRaises(ValueError):
            self.auth.delete_admin(self.user['uid'], other['uid'])

    def test_concurrent_admin_deletion_preserves_admin(self):
        other = self.auth.create_admin('second@example.org', 'second admin password')
        def attempt(pair):
            try:
                return self.auth.delete_admin(*pair)
            except ValueError:
                return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(attempt, [(self.user['uid'], other['uid']), (other['uid'], self.user['uid'])]))
        self.assertEqual(sum(results), 1)
        with sqlite3.connect(self.path) as database:
            self.assertEqual(database.execute('SELECT count(*) FROM auth_users').fetchone()[0], 1)

    def test_cli_metadata_sync_and_uid_conflict(self):
        script = Path(__file__).resolve().parents[1] / 'scripts' / 'local-auth-admin.py'
        spec = importlib.util.spec_from_file_location('local_auth_admin', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        data_path = self.path.parent / 'data.sqlite3'
        with sqlite3.connect(data_path) as database:
            database.execute('CREATE TABLE documents (collection TEXT, id TEXT, data TEXT, PRIMARY KEY(collection,id))')
            database.execute('INSERT INTO documents VALUES (?, ?, ?)', ('users', self.user['uid'], json.dumps({'email': self.user['email'], 'name': 'Keep me'})))
        with self.assertRaises(ValueError):
            module.metadata_connection(data_path, self.path, self.user['email'], 'wrong-uid')
        arguments = ['local-auth-admin.py', '--path', str(self.path), 'set-password', '--email', self.user['email'], '--data-database', str(data_path)]
        with patch('sys.argv', arguments), patch('sys.stdin.isatty', return_value=True), patch.object(module.getpass, 'getpass', return_value='recovered password'), patch('builtins.print'):
            self.assertEqual(module.main(), 0)
        with sqlite3.connect(data_path) as database:
            metadata = json.loads(database.execute('SELECT data FROM documents').fetchone()[0])
        self.assertEqual(metadata, {'email': self.user['email'], 'name': 'Keep me'})
        self.assertIsNotNone(self.auth.login(self.user['email'], 'recovered password'))


if __name__ == '__main__':
    unittest.main()
