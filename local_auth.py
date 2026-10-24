"""Opt-in local authentication. See AUTH_MIGRATION.md for the trust boundary."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
import threading
from contextlib import contextmanager, closing
from pathlib import Path

HASH_SLOTS = threading.BoundedSemaphore(2)


class LocalAuth:
    ADMIN_TTL = 12 * 60 * 60
    ANONYMOUS_TTL = 30 * 24 * 60 * 60
    RESET_TTL = 30 * 60

    def __init__(self, path):
        self.path = Path(path).absolute()
        if self.path.parent.name != '.private' or self.path.is_symlink():
            raise ValueError('Use a separate authentication file directly under .private')
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.path.parent, 0o700)
        descriptor = os.open(self.path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.fchmod(descriptor, 0o600)
        os.close(descriptor)
        with self._connect() as database:
            tables = {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if tables - {'auth_users', 'auth_sessions', 'auth_resets'}:
                raise ValueError('Authentication requires a dedicated database')
            database.execute('CREATE TABLE IF NOT EXISTS auth_users (uid TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt BLOB NOT NULL, password_hash BLOB NOT NULL)')
            database.execute('CREATE TABLE IF NOT EXISTS auth_sessions (digest TEXT PRIMARY KEY, uid TEXT NOT NULL, anonymous INTEGER NOT NULL, expires REAL NOT NULL)')
            database.execute('CREATE TABLE IF NOT EXISTS auth_resets (digest TEXT PRIMARY KEY, uid TEXT NOT NULL, expires REAL NOT NULL)')

    @contextmanager
    def _connect(self, write=True):
        database = sqlite3.connect(self.path, timeout=30)
        database.row_factory = sqlite3.Row
        try:
            with database:
                database.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
                yield database
        finally:
            database.close()

    @staticmethod
    def _email(email):
        if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r'[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+', email):
            raise ValueError('Invalid email')
        try:
            if len(email.encode('utf-8')) > 254:
                raise ValueError('Invalid email')
        except UnicodeError as error:
            raise ValueError('Invalid email') from error
        return email.casefold()

    @staticmethod
    def _password(password, new=False):
        if not isinstance(password, str) or not 1 <= len(password) <= 1024:
            raise ValueError('Invalid password')
        try:
            encoded = password.encode('utf-8')
        except UnicodeError as error:
            raise ValueError('Invalid password') from error
        if len(encoded) > 1024 or (new and len(password) < 12):
            raise ValueError('New passwords must contain 12–1024 characters, at most 1024 bytes')
        return encoded

    @staticmethod
    def _digest(token):
        if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
            raise ValueError('Invalid token')
        return hashlib.sha256(token.encode('ascii')).hexdigest()

    @staticmethod
    def _hash(password, salt):
        with HASH_SLOTS:
            return hashlib.scrypt(password, salt=salt, n=32768, r=8, p=3, maxmem=64 * 1024 * 1024, dklen=32)

    @staticmethod
    def _user(uid, email=None, anonymous=False):
        return {'uid': uid, 'email': email, 'isAnonymous': anonymous, 'isAdmin': not anonymous}

    @staticmethod
    def _cleanup(database):
        now = time.time()
        database.execute('DELETE FROM auth_sessions WHERE expires <= ?', (now,))
        database.execute('DELETE FROM auth_resets WHERE expires <= ?', (now,))

    def cleanup(self):
        with self._connect() as database:
            self._cleanup(database)

    def backup(self, destination):
        destination = Path(destination).absolute()
        if destination.parent.name != '.private' or destination == self.path or destination.is_symlink():
            raise ValueError('Backup requires a separate file under .private')
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(destination.parent, 0o700)
        descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        os.close(descriptor)
        try:
            with self._connect(write=False) as source, closing(sqlite3.connect(destination)) as target:
                source.backup(target)
                with target:
                    target.execute('DELETE FROM auth_sessions')
                    target.execute('DELETE FROM auth_resets')
                if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('Backup integrity check failed')
        except BaseException:
            destination.unlink(missing_ok=True)
            raise

    def create_admin(self, email, password, uid=None):
        """Trusted callers only: HTTP callers MUST authorize an existing admin first."""
        email = self._email(email)
        password = self._password(password, new=True)
        uid = uid if uid is not None else 'admin_' + secrets.token_urlsafe(24)
        if not isinstance(uid, str) or not re.fullmatch(r'[A-Za-z0-9_.:@-]{1,128}', uid) or uid.startswith('anon_'):
            raise ValueError('Invalid admin UID')
        salt = secrets.token_bytes(16)
        password_hash = self._hash(password, salt)
        try:
            with self._connect() as database:
                self._cleanup(database)
                database.execute('INSERT INTO auth_users VALUES (?, ?, ?, ?)', (uid, email, salt, password_hash))
        except sqlite3.IntegrityError as error:
            raise ValueError('Email or UID already exists') from error
        return self._user(uid, email)

    def _session(self, database, user):
        token = secrets.token_urlsafe(32)
        expires = time.time() + (self.ANONYMOUS_TTL if user['isAnonymous'] else self.ADMIN_TTL)
        database.execute('INSERT INTO auth_sessions VALUES (?, ?, ?, ?)', (self._digest(token), user['uid'], int(user['isAnonymous']), expires))
        return {'token': token, 'user': user, 'expiresAt': expires}

    def login(self, email, password):
        email = self._email(email)
        password = self._password(password)
        with self._connect(write=False) as database:
            row = database.execute('SELECT * FROM auth_users WHERE email = ?', (email,)).fetchone()
        candidate = self._hash(password, row['salt'] if row else bytes(16))
        matches = hmac.compare_digest(candidate, row['password_hash'] if row else bytes(32))
        if not row or not matches:
            return None
        with self._connect() as database:
            self._cleanup(database)
            current = database.execute('SELECT * FROM auth_users WHERE uid = ?', (row['uid'],)).fetchone()
            if not current or not hmac.compare_digest(current['password_hash'], row['password_hash']) or not hmac.compare_digest(current['salt'], row['salt']):
                return None
            return self._session(database, self._user(current['uid'], current['email']))

    def get_user_by_email(self, email):
        email = self._email(email)
        with self._connect(write=False) as database:
            row = database.execute('SELECT uid, email FROM auth_users WHERE email = ?', (email,)).fetchone()
            return self._user(row['uid'], row['email']) if row else None

    def delete_admin(self, uid, actor_uid):
        """Trusted caller supplies authenticated actor UID; never accept it from JSON."""
        for identifier in (uid, actor_uid):
            if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_.:@-]{1,128}', identifier):
                raise ValueError('Invalid UID')
        with self._connect() as database:
            self._cleanup(database)
            if not database.execute('SELECT 1 FROM auth_users WHERE uid = ?', (actor_uid,)).fetchone():
                raise ValueError('Actor must be an existing admin')
            if uid == actor_uid:
                raise ValueError('Cannot delete yourself')
            if not database.execute('SELECT 1 FROM auth_users WHERE uid = ?', (uid,)).fetchone():
                return False
            if database.execute('SELECT count(*) FROM auth_users').fetchone()[0] <= 1:
                raise ValueError('Cannot delete the last admin')
            database.execute('DELETE FROM auth_sessions WHERE uid = ?', (uid,))
            database.execute('DELETE FROM auth_resets WHERE uid = ?', (uid,))
            database.execute('DELETE FROM auth_users WHERE uid = ?', (uid,))
            return True

    def anonymous(self):
        with self._connect() as database:
            self._cleanup(database)
            return self._session(database, self._user('anon_' + secrets.token_urlsafe(24), anonymous=True))

    def get_user(self, token):
        digest = self._digest(token)
        with self._connect(write=False) as database:
            row = database.execute('SELECT * FROM auth_sessions WHERE digest = ? AND expires > ?', (digest, time.time())).fetchone()
            if not row:
                return None
            if row['anonymous']:
                return self._user(row['uid'], anonymous=True)
            user = database.execute('SELECT * FROM auth_users WHERE uid = ?', (row['uid'],)).fetchone()
            return self._user(user['uid'], user['email']) if user else None

    def logout(self, token):
        digest = self._digest(token)
        with self._connect() as database:
            self._cleanup(database)
            database.execute('DELETE FROM auth_sessions WHERE digest = ?', (digest,))

    def issue_reset(self, email):
        email = self._email(email)
        with self._connect() as database:
            self._cleanup(database)
            user = database.execute('SELECT uid FROM auth_users WHERE email = ?', (email,)).fetchone()
            if not user:
                return None
            token = secrets.token_urlsafe(32)
            expires = time.time() + self.RESET_TTL
            database.execute('DELETE FROM auth_resets WHERE uid = ?', (user['uid'],))
            database.execute('INSERT INTO auth_resets VALUES (?, ?, ?)', (self._digest(token), user['uid'], expires))
            return {'token': token, 'expiresAt': expires}

    def _replace_password(self, database, uid, password):
        salt = secrets.token_bytes(16)
        database.execute('UPDATE auth_users SET salt = ?, password_hash = ? WHERE uid = ?', (salt, self._hash(password, salt), uid))
        database.execute('DELETE FROM auth_sessions WHERE uid = ?', (uid,))
        database.execute('DELETE FROM auth_resets WHERE uid = ?', (uid,))

    def reset_password(self, token, password):
        digest = self._digest(token)
        password = self._password(password, new=True)
        with self._connect() as database:
            self._cleanup(database)
            row = database.execute('SELECT u.* FROM auth_resets r JOIN auth_users u ON u.uid = r.uid WHERE r.digest = ?', (digest,)).fetchone()
            if not row:
                return None
            self._replace_password(database, row['uid'], password)
            return self._user(row['uid'], row['email'])

    def set_admin_password(self, email, password):
        """Offline recovery only; never expose as an unauthenticated HTTP endpoint."""
        email = self._email(email)
        password = self._password(password, new=True)
        with self._connect() as database:
            self._cleanup(database)
            row = database.execute('SELECT * FROM auth_users WHERE email = ?', (email,)).fetchone()
            if not row:
                return None
            self._replace_password(database, row['uid'], password)
            return self._user(row['uid'], row['email'])
