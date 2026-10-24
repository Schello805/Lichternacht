#!/usr/bin/env python3
"""Offline local-auth bootstrap/recovery; never accepts passwords as arguments."""

import argparse
import getpass
import json
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_auth import LocalAuth


def metadata_connection(path, auth_path, email, uid):
    path = Path(path).resolve(strict=True)
    if path == Path(auth_path).resolve():
        raise ValueError('Data and authentication databases must be separate')
    database = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=30)
    try:
        database.execute('BEGIN IMMEDIATE')
        for collection, identifier, raw in database.execute("SELECT collection, id, data FROM documents WHERE collection IN ('users', 'globalAdmins')"):
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError('Invalid existing role metadata')
            existing_email = data.get('email')
            if isinstance(existing_email, str) and existing_email.casefold() == email.casefold() and identifier != uid:
                raise ValueError('Use the existing Firebase UID for this email')
            if identifier == uid and existing_email and existing_email.casefold() != email.casefold():
                raise ValueError('UID belongs to different email metadata')
        return database
    except BaseException:
        database.close()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--path', required=True, help='Dedicated database under .private')
    parser.add_argument('action', choices=['create', 'set-password'])
    parser.add_argument('--email', required=True)
    parser.add_argument('--uid', help='Existing Firebase UID (create only)')
    parser.add_argument('--data-database', help='Optional existing data SQLite database for users metadata sync')
    arguments = parser.parse_args()
    if arguments.action != 'create' and arguments.uid:
        parser.error('--uid is only valid for create')
    if arguments.action == 'create' and not arguments.uid:
        parser.error('create requires --uid: preserve the exact existing Firebase UID')
    if not sys.stdin.isatty():
        parser.error('An interactive terminal is required for hidden password entry')
    database = None
    try:
        password = getpass.getpass('New password (minimum 12 characters): ')
        confirmation = getpass.getpass('Repeat password: ')
        if password != confirmation:
            raise ValueError('Passwords do not match')
        auth = LocalAuth(arguments.path)
        existing = auth.get_user_by_email(arguments.email)
        uid = arguments.uid if arguments.action == 'create' else existing['uid'] if existing else None
        if arguments.data_database:
            if uid is None:
                raise ValueError('Admin does not exist')
            database = metadata_connection(arguments.data_database, arguments.path, arguments.email, uid)
        if arguments.action == 'create':
            user = auth.create_admin(arguments.email, password, uid=arguments.uid)
        else:
            user = auth.set_admin_password(arguments.email, password)
            if user is None:
                raise ValueError('Admin does not exist')
        if database is not None:
            row = database.execute("SELECT data FROM documents WHERE collection = 'users' AND id = ?", (user['uid'],)).fetchone()
            metadata = json.loads(row[0]) if row else {}
            metadata['email'] = user['email']
            database.execute("INSERT OR REPLACE INTO documents (collection, id, data) VALUES ('users', ?, ?)", (user['uid'], json.dumps(metadata, ensure_ascii=False)))
            database.commit()
    except (ValueError, OSError, sqlite3.Error, EOFError, KeyboardInterrupt, TypeError) as error:
        print('Operation failed: ' + str(error), file=sys.stderr)
        return 1
    finally:
        if database is not None:
            database.close()
    print('Admin credentials saved. Existing sessions were revoked for password recovery.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
