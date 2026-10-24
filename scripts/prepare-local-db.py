import argparse
import base64
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path


def import_backup(source, destination):
    backup = json.loads(Path(source).read_text(encoding='utf-8'))
    if backup.get('format') != 'lichternacht-full-backup' or backup.get('version') != 3:
        raise ValueError('Eine Komplettsicherung im Format Version 3 wird benötigt.')
    for field in ('stations', 'events', 'assets'):
        if not isinstance(backup.get(field), list):
            raise ValueError('Ungültiges Feld: ' + field)
    if not isinstance(backup.get('config'), dict):
        raise ValueError('Die Konfiguration fehlt.')
    assets = [base64.b64decode(asset['base64'], validate=True) for asset in backup['assets']]
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        with closing(sqlite3.connect(destination)) as database, database:
            database.execute('CREATE TABLE snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)')
            database.execute('CREATE TABLE assets (position INTEGER PRIMARY KEY, metadata TEXT NOT NULL, content BLOB NOT NULL)')
            metadata = {key: value for key, value in backup.items() if key != 'assets'}
            database.execute('INSERT INTO snapshot VALUES (1, ?)', (json.dumps(metadata, ensure_ascii=False),))
            for position, (asset, content) in enumerate(zip(backup['assets'], assets)):
                details = {key: value for key, value in asset.items() if key != 'base64'}
                database.execute('INSERT INTO assets VALUES (?, ?, ?)', (position, json.dumps(details), content))
        return len(assets)
    except Exception:
        Path(destination).unlink(missing_ok=True)
        raise


def export_backup(source):
    with closing(sqlite3.connect(Path(source).resolve().as_uri() + '?mode=ro', uri=True)) as database:
        backup = json.loads(database.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()[0])
        backup['assets'] = []
        for metadata, content in database.execute('SELECT metadata, content FROM assets ORDER BY position'):
            asset = json.loads(metadata)
            asset['base64'] = base64.b64encode(content).decode('ascii')
            backup['assets'].append(asset)
        return backup


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Komplettsicherung in eine isolierte SQLite-Testdatenbank übernehmen.')
    parser.add_argument('backup')
    parser.add_argument('database')
    args = parser.parse_args()
    count = import_backup(args.backup, args.database)
    if export_backup(args.database) != json.loads(Path(args.backup).read_text(encoding='utf-8')):
        raise RuntimeError('Der Abgleich der Sicherung ist fehlgeschlagen.')
    print(f'Sicherung verlustfrei übernommen und abgeglichen: {count} Dateien. Keine Live-Umschaltung.')
