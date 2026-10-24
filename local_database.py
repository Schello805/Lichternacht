import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class LocalDatabase:
    def __init__(self, path):
        self.path = Path(path).resolve()

    @contextmanager
    def connect(self):
        database = sqlite3.connect(self.path.as_uri() + '?mode=rw', uri=True, timeout=10)
        try:
            with database:
                yield database
        finally:
            database.close()

    def read(self):
        with self.connect() as database:
            row = database.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()
            if not row:
                raise ValueError('Die Datenbank enthält keine Sicherung.')
            return json.loads(row[0])

    def like(self, user_id, identifier):
        with self.connect() as database:
            database.execute('BEGIN IMMEDIATE')
            database.execute('CREATE TABLE IF NOT EXISTS likes (user_id TEXT, station_id TEXT, PRIMARY KEY(user_id, station_id))')
            snapshot = json.loads(database.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()[0])
            station = next((item for item in snapshot['stations'] if str(item.get('__docId', item.get('id'))) == identifier), None)
            if station is None:
                raise ValueError('Station nicht gefunden')
            inserted = database.execute('INSERT OR IGNORE INTO likes VALUES (?, ?)', (user_id, identifier)).rowcount
            if inserted:
                station['likes'] = min(100000, int(station.get('likes', 0)) + 1)
                database.execute('UPDATE snapshot SET data = ? WHERE id = 1', (json.dumps(snapshot, ensure_ascii=False),))

    def write(self, action, collection, identifier, data=None, merge=False):
        self.write_many([{'action': action, 'collection': collection, 'id': identifier, 'data': data, 'merge': merge}])

    def write_many(self, operations):
        if not isinstance(operations, list) or not operations or len(operations) > 500:
            raise ValueError('Ungültige Anzahl an Änderungen.')
        with self.connect() as database:
            database.execute('BEGIN IMMEDIATE')
            snapshot = json.loads(database.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()[0])
            for operation in operations:
                self.apply(snapshot, operation.get('action'), operation.get('collection'), str(operation.get('id', '')), operation.get('data'), operation.get('merge') is True)
            database.execute('UPDATE snapshot SET data = ? WHERE id = 1', (json.dumps(snapshot, ensure_ascii=False),))

    @staticmethod
    def apply(snapshot, action, collection, identifier, data=None, merge=False):
        if collection not in ('stations', 'events', 'config'):
            raise ValueError('Unbekannte Datensammlung.')
        if action not in ('set', 'delete'):
            raise ValueError('Unbekannte Aktion.')
        if collection == 'config' and action == 'delete':
            raise ValueError('Die Konfiguration darf nicht gelöscht werden.')
        if action == 'set' and not isinstance(data, dict):
            raise ValueError('Ungültiger Datensatz.')
        if not identifier or len(identifier) > 128 or '/' in identifier:
            raise ValueError('Ungültige Datensatz-ID.')
        if collection == 'config':
            snapshot['config'] = LocalDatabase.merge(snapshot.get('config', {}), data) if merge else data
            if 'downloads' in snapshot['config']:
                snapshot['downloads'] = snapshot['config']['downloads']
        else:
            records = snapshot[collection]
            key = lambda item: str(item.get('__docId', item.get('id', '')))
            previous = next((item for item in records if key(item) == identifier), None)
            records = [item for item in records if key(item) != identifier]
            if action == 'set':
                value = LocalDatabase.merge(previous or {}, data) if merge else dict(data)
                value['__docId'] = identifier
                records.append(value)
            snapshot[collection] = records

    @staticmethod
    def merge(previous, changes):
        result = dict(previous)
        for key, value in changes.items():
            result[key] = LocalDatabase.merge(result.get(key, {}), value) if isinstance(value, dict) and isinstance(result.get(key, {}), dict) else value
        return result
