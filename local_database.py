import json
import sqlite3
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from contextlib import contextmanager
from pathlib import Path


class LocalDatabase:
    def __init__(self, path):
        self.path = Path(path).resolve()

    @contextmanager
    def connect(self):
        database = sqlite3.connect(self.path.as_uri() + '?mode=rw', uri=True, timeout=10)
        database.execute('CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection, id))')
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

    def backup(self):
        with self.connect() as database:
            database.execute('BEGIN')
            snapshot = json.loads(database.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()[0])
            documents = {}
            for collection, identifier, data in database.execute('SELECT collection, id, data FROM documents'):
                documents.setdefault(collection, []).append({'id': identifier, 'data': json.loads(data)})
            snapshot['localDocuments'] = documents
            snapshot['localLikes'] = list(database.execute('SELECT user_id, station_id FROM likes')) if database.execute("SELECT 1 FROM sqlite_master WHERE name = 'likes'").fetchone() else []
            snapshot['assets'] = []
            snapshot['createdAt'] = datetime.now(timezone.utc).isoformat()
            return snapshot

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
                collection = operation.get('collection')
                identifier = str(operation.get('id', ''))
                if collection == 'stations' and operation.get('action') == 'rename':
                    self.rename_station(database, snapshot, identifier, operation.get('data'))
                    continue
                if collection in ('stations', 'events', 'config'):
                    self.apply(snapshot, operation.get('action'), collection, identifier, operation.get('data'), operation.get('merge') is True)
                    if collection == 'stations' and (operation.get('data') or {}).get('likes') == 0:
                        if database.execute("SELECT 1 FROM sqlite_master WHERE name = 'likes'").fetchone():
                            database.execute('DELETE FROM likes WHERE station_id = ?', (identifier,))
                else:
                    self.apply_document(database, operation)
            database.execute('UPDATE snapshot SET data = ? WHERE id = 1', (json.dumps(snapshot, ensure_ascii=False),))

    @staticmethod
    def rename_station(database, snapshot, old_id, data):
        new_id = str((data or {}).get('id', ''))
        if not new_id.isdigit() or int(new_id) < 1:
            raise ValueError('Ungültige Stationsnummer.')
        source = next((item for item in snapshot['stations'] if str(item.get('__docId', item.get('id'))) == old_id), None)
        if source is None:
            raise ValueError('Die ursprüngliche Station existiert nicht mehr.')
        old_number = str(source.get('id'))
        if any(item is not source and str(item.get('id')) == new_id for item in snapshot['stations']):
            raise ValueError('Die neue Stationsnummer ist bereits vergeben.')
        for event in snapshot['events']:
            if str(event.get('stationId', '')) == old_number:
                event['stationId'] = data['id']
        for identifier, encoded in database.execute("SELECT id, data FROM documents WHERE collection = 'checkins'").fetchall():
            checkin = json.loads(encoded)
            if str(checkin.get('stationId')) != old_number:
                continue
            owner = checkin.get('ownerUid')
            if not owner:
                raise ValueError('Check-in ohne Besitzer: Umnummerierung abgebrochen.')
            checkin['stationId'] = new_id
            database.execute("DELETE FROM documents WHERE collection = 'checkins' AND id = ?", (identifier,))
            database.execute("INSERT INTO documents VALUES ('checkins', ?, ?)", (owner + '_' + new_id, json.dumps(checkin, ensure_ascii=False)))
        if database.execute("SELECT 1 FROM sqlite_master WHERE name = 'likes'").fetchone():
            database.execute('UPDATE likes SET station_id = ? WHERE station_id = ?', (new_id, old_id))
        source.update(data)
        source['__docId'] = new_id

    @staticmethod
    def apply_document(database, operation):
        collection = operation.get('collection')
        identifier = str(operation.get('id', ''))
        if collection not in ('checkins', 'auditLogs', 'presence', 'users', 'globalAdmins', 'reports', 'broadcast', 'globalConfig', 'stats'):
            raise ValueError('Unbekannte Datensammlung.')
        if not identifier or len(identifier) > 200 or '/' in identifier:
            raise ValueError('Ungültige Datensatz-ID.')
        if operation.get('action') == 'delete':
            database.execute('DELETE FROM documents WHERE collection = ? AND id = ?', (collection, identifier))
            return
        if operation.get('action') != 'set' or not isinstance(operation.get('data'), dict):
            raise ValueError('Ungültige Änderung.')
        row = database.execute('SELECT data FROM documents WHERE collection = ? AND id = ?', (collection, identifier)).fetchone()
        previous = json.loads(row[0]) if row else {}
        changes = operation['data']
        changes = LocalDatabase.resolve_operations(changes, previous)
        data = LocalDatabase.merge(previous, changes) if operation.get('merge') else changes
        database.execute('INSERT OR REPLACE INTO documents VALUES (?, ?, ?)', (collection, identifier, json.dumps(data, ensure_ascii=False)))

    def records(self, collection, identifier=None):
        if collection in ('stations', 'events', 'config'):
            snapshot = self.read()
            rows = [('config', snapshot['config'])] if collection == 'config' else [(str(item.get('__docId', item.get('id'))), item) for item in snapshot[collection]]
        else:
            with self.connect() as database:
                query = 'SELECT id, data FROM documents WHERE collection = ?'
                parameters = (collection,)
                if identifier is not None:
                    query += ' AND id = ?'
                    parameters = (collection, identifier)
                rows = [(row[0], json.loads(row[1])) for row in database.execute(query, parameters)]
        return [{'id': key, 'data': value} for key, value in rows if identifier is None or key == identifier]

    def is_admin(self, user_id):
        return bool(self.records('users', user_id) or self.records('globalAdmins', user_id))

    def active_presence_count(self, since):
        with self.connect() as database:
            return database.execute("SELECT count(*) FROM documents WHERE collection = 'presence' AND julianday(json_extract(data, '$.lastSeen')) > julianday(?)", (since,)).fetchone()[0]

    def visitor_write(self, user_id, operation):
        collection = operation.get('collection')
        identifier = str(operation.get('id', ''))
        data = operation.get('data')
        if collection == 'checkins' and operation.get('action') == 'undo-checkin':
            return self.undo_checkin(user_id, identifier)
        if operation.get('action') != 'set' or not isinstance(data, dict):
            raise ValueError('Diese Änderung benötigt Adminrechte.')
        now = datetime.now(timezone.utc)
        if collection == 'presence':
            identifier = user_id
            data = {'lastSeen': now.isoformat()}
        elif collection == 'auditLogs':
            allowed = {'stationId', 'stationName', 'eventId', 'eventTitle', 'action', 'count', 'level', 'itemType'}
            details = data.get('details', {})
            if not isinstance(details, dict) or not set(details).issubset(allowed):
                raise ValueError('Ungültige Protokolldaten.')
            details = {key: value if isinstance(value, (int, float)) else str(value)[:120] for key, value in details.items()}
            data = {'eventType': str(data.get('eventType', ''))[:48], 'actorId': user_id, 'actorRole': 'visitor', 'createdAt': now.isoformat(), 'details': details}
            identifier = user_id + '_' + identifier
        elif collection == 'checkins':
            return self.checkin(user_id, data)
        elif collection == 'stats':
            return
        else:
            raise ValueError('Diese Änderung benötigt Adminrechte.')
        self.write('set', collection, identifier, data)
        if collection == 'presence':
            with self.connect() as database:
                database.execute("DELETE FROM documents WHERE collection = 'presence' AND json_extract(data, '$.lastSeen') < ?", (datetime.fromtimestamp(time.time() - 86400, timezone.utc).isoformat(),))

    def checkin(self, user_id, payload):
        station_id = str(payload.get('stationId', ''))
        identifier = user_id + '_' + station_id
        with self.connect() as database:
            database.execute('BEGIN IMMEDIATE')
            if database.execute("SELECT 1 FROM documents WHERE collection = 'checkins' AND id = ?", (identifier,)).fetchone():
                return
            snapshot = json.loads(database.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()[0])
            window = snapshot['config'].get('checkinWindow', {})
            now = datetime.now(timezone.utc)
            if not float(window.get('startMs', 0)) <= now.timestamp() * 1000 <= float(window.get('endMs', 0)):
                raise ValueError('Einchecken ist außerhalb des Veranstaltungszeitraums nicht möglich.')
            station = next((item for item in snapshot['stations'] if str(item.get('id')) == station_id), None)
            if not station:
                raise ValueError('Station nicht gefunden.')
            count = database.execute("SELECT count(*) FROM documents WHERE collection = 'checkins' AND json_extract(data, '$.ownerUid') = ?", (user_id,)).fetchone()[0] + 1
            local = now.astimezone(ZoneInfo('Europe/Berlin'))
            thresholds = snapshot['config'].get('rewards', {}).get('thresholds', {})
            level = 'diamond' if count == len(snapshot['stations']) else ''
            if not level:
                for candidate, fallback in [('gold', 95), ('silver', 90), ('bronze', 80)]:
                    if count >= max(1, int(len(snapshot['stations']) * float(thresholds.get(candidate, fallback)) / 100)):
                        level = candidate
                        break
            data = {'type': 'checkin', 'ownerUid': user_id, 'anonymousId': user_id, 'stationId': station_id, 'stationName': station.get('name', ''), 'checkedAt': now.isoformat(), 'receivedAt': now.isoformat(), 'dateKey': local.strftime('%Y-%m-%d'), 'hour': local.hour, 'passCountAfter': count, 'reachedLevel': level, 'source': 'lichterpass', 'appId': snapshot.get('appId')}
            self.apply_document(database, {'action': 'set', 'collection': 'checkins', 'id': identifier, 'data': data})
            stats_row = database.execute("SELECT data FROM documents WHERE collection = 'stats' AND id = 'stats'").fetchone()
            stats = json.loads(stats_row[0]) if stats_row else {}
            if level and not database.execute("SELECT 1 FROM documents WHERE collection = 'checkins' AND json_extract(data, '$.ownerUid') = ? AND json_extract(data, '$.reachedLevel') = ? AND id != ?", (user_id, level, identifier)).fetchone():
                stats['count_' + level] = int(stats.get('count_' + level, 0)) + 1
                self.apply_document(database, {'action': 'set', 'collection': 'stats', 'id': 'stats', 'data': stats})

    def undo_checkin(self, user_id, station_id):
        with self.connect() as database:
            database.execute('BEGIN IMMEDIATE')
            rows = database.execute("SELECT id, data FROM documents WHERE collection = 'checkins' AND json_extract(data, '$.ownerUid') = ? ORDER BY json_extract(data, '$.checkedAt'), id", (user_id,)).fetchall()
            previous_levels = {json.loads(encoded).get('reachedLevel') for _, encoded in rows} - {None, ''}
            database.execute("DELETE FROM documents WHERE collection = 'checkins' AND id = ? AND json_extract(data, '$.ownerUid') = ?", (user_id + '_' + station_id, user_id))
            snapshot = json.loads(database.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()[0])
            total = len(snapshot['stations'])
            thresholds = snapshot['config'].get('rewards', {}).get('thresholds', {})
            count = 0
            levels = set()
            for identifier, encoded in rows:
                if identifier == user_id + '_' + station_id:
                    continue
                count += 1
                data = json.loads(encoded)
                level = 'diamond' if count == total and total else ''
                if not level:
                    for candidate, fallback in [('gold', 95), ('silver', 90), ('bronze', 80)]:
                        if total and count >= max(1, int(total * float(thresholds.get(candidate, fallback)) / 100)):
                            level = candidate
                            break
                data.update(passCountAfter=count, reachedLevel=level)
                if level:
                    levels.add(level)
                database.execute("UPDATE documents SET data = ? WHERE collection = 'checkins' AND id = ?", (json.dumps(data, ensure_ascii=False), identifier))
            row = database.execute("SELECT data FROM documents WHERE collection = 'stats' AND id = 'stats'").fetchone()
            stats = json.loads(row[0]) if row else {}
            for level in previous_levels | levels:
                key = 'count_' + level
                stats[key] = max(0, int(stats.get(key, 0)) + int(level in levels) - int(level in previous_levels))
            self.apply_document(database, {'action': 'set', 'collection': 'stats', 'id': 'stats', 'data': stats})

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
    def resolve_operations(changes, previous):
        result = {}
        for key, value in changes.items():
            if isinstance(value, dict) and value.get('__localOperation') == 'timestamp':
                result[key] = datetime.now(timezone.utc).isoformat()
            elif isinstance(value, dict) and value.get('__localOperation') == 'increment':
                result[key] = float(previous.get(key, 0)) + float(value['amount'])
            elif isinstance(value, dict):
                result[key] = LocalDatabase.resolve_operations(value, previous.get(key, {}) if isinstance(previous.get(key), dict) else {})
            else:
                result[key] = value
        return result

    @staticmethod
    def merge(previous, changes):
        result = dict(previous)
        for key, value in changes.items():
            result[key] = LocalDatabase.merge(result.get(key, {}), value) if isinstance(value, dict) and isinstance(result.get(key, {}), dict) else value
        return result
