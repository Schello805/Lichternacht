import importlib.util
import json
import base64
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
import unittest
from pathlib import Path

from local_database import LocalDatabase

spec = importlib.util.spec_from_file_location('prepare_local_db', Path(__file__).resolve().parents[1] / 'scripts' / 'prepare-local-db.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class LocalDatabaseTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        source = Path(self.directory.name) / 'backup.json'
        self.path = Path(self.directory.name) / 'local.sqlite3'
        source.write_text(json.dumps({'format': 'lichternacht-full-backup', 'version': 3, 'appId': 'test', 'stations': [{'id': 1, 'name': 'Station', 'tags': ['wc']}], 'events': [], 'config': {'downloads': {'icsDate': '21.11.2026'}}, 'assets': []}))
        importer.import_backup(source, self.path)
        self.database = LocalDatabase(self.path)

    def test_edit_delete_and_config_merge(self):
        self.database.write('set', 'stations', '1', {'name': 'Neu'}, True)
        self.assertEqual(self.database.read()['stations'][0]['tags'], ['wc'])
        self.database.write('set', 'config', 'config', {'title': 'Lichternacht'}, True)
        self.assertEqual(self.database.read()['config']['downloads']['icsDate'], '21.11.2026')
        self.database.write('delete', 'stations', '1')
        self.assertEqual(self.database.read()['stations'], [])

    def test_failed_batch_rolls_back(self):
        previous = self.database.read()
        with self.assertRaises(ValueError):
            self.database.write_many([
                {'action': 'set', 'collection': 'events', 'id': 'concert', 'data': {'title': 'Konzert'}},
                {'action': 'set', 'collection': 'unknown', 'id': 'attacker', 'data': {}}
            ])
        self.assertEqual(self.database.read(), previous)

    def test_likes_are_idempotent_per_user(self):
        self.database.like('visitor', '1')
        self.database.like('visitor', '1')
        self.assertEqual(self.database.read()['stations'][0]['likes'], 1)

    def test_import_does_not_overwrite(self):
        with self.assertRaises(FileExistsError):
            importer.import_backup(Path(self.directory.name) / 'backup.json', self.path)

    def test_checkins_are_server_counted_and_idempotent(self):
        self.database.write('set', 'config', 'config', {'checkinWindow': {'startMs': 0, 'endMs': (time.time() + 60) * 1000}}, True)
        payload = {'stationId': '1', 'stationName': 'Gefälscht', 'passCountAfter': 999, 'reachedLevel': 'invented'}
        with ThreadPoolExecutor(max_workers=4) as executor:
            list(executor.map(lambda unused: self.database.checkin('visitor', payload), range(4)))
        records = self.database.records('checkins')
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['data']['passCountAfter'], 1)
        self.assertEqual(records[0]['data']['stationName'], 'Station')
        self.assertEqual(records[0]['data']['ownerUid'], 'visitor')
        self.assertEqual(self.database.records('stats')[0]['data']['count_diamond'], 1)

    def test_checkin_outside_window_and_nonexistent_station_are_rejected(self):
        with self.assertRaises(ValueError):
            self.database.checkin('visitor', {'stationId': '1'})
        self.database.write('set', 'config', 'config', {'checkinWindow': {'startMs': 0, 'endMs': (time.time() + 60) * 1000}}, True)
        with self.assertRaises(ValueError):
            self.database.checkin('visitor', {'stationId': '999'})
        self.assertEqual(self.database.records('checkins'), [])

    def test_visitor_cannot_grant_admin_rights_or_forge_statistics(self):
        with self.assertRaises(ValueError):
            self.database.visitor_write('visitor', {'action': 'set', 'collection': 'users', 'id': 'visitor', 'data': {'email': 'attacker'}})
        self.database.visitor_write('visitor', {'action': 'set', 'collection': 'stats', 'id': 'stats', 'data': {'count_gold': 999}})
        self.assertEqual(self.database.records('stats'), [])

    def test_presence_and_audit_identity_are_server_owned(self):
        self.database.visitor_write('visitor', {'action': 'set', 'collection': 'presence', 'id': 'someone-else', 'data': {'lastSeen': '2099'}})
        self.assertEqual(self.database.records('presence')[0]['id'], 'visitor')
        self.database.visitor_write('visitor', {'action': 'set', 'collection': 'auditLogs', 'id': 'entry', 'data': {'eventType': 'station_opened', 'actorRole': 'admin', 'details': {}}})
        entry = self.database.records('auditLogs')[0]
        self.assertEqual(entry['id'], 'visitor_entry')
        self.assertEqual(entry['data']['actorRole'], 'visitor')

    def test_full_backup_preserves_auxiliary_data_and_likes(self):
        self.database.like('visitor', '1')
        self.database.write('set', 'users', 'admin', {'email': 'admin@example.test'})
        backup = self.database.backup()
        backup_path = Path(self.directory.name) / 'full.json'
        backup_path.write_text(json.dumps(backup))
        restored_path = Path(self.directory.name) / 'restored.sqlite3'
        importer.import_backup(backup_path, restored_path)
        restored = LocalDatabase(restored_path)
        self.assertTrue(restored.is_admin('admin'))
        restored.like('visitor', '1')
        self.assertEqual(restored.read()['stations'][0]['likes'], 1)

    def test_asset_restore_rejects_paths_outside_downloads(self):
        backup = {'assets': [{'sourceUrl': '/.env', 'base64': base64.b64encode(b'secret').decode()}]}
        with self.assertRaises(ValueError):
            importer.restore_assets(backup, self.directory.name)
        backup['assets'][0]['sourceUrl'] = '/downloads/stations/image.webp'
        importer.restore_assets(backup, self.directory.name)
        self.assertEqual((Path(self.directory.name) / 'downloads/stations/image.webp').read_bytes(), b'secret')

    def test_full_export_matches_after_import_with_embedded_file(self):
        backup = self.database.backup()
        backup['localLikes'] = [list(item) for item in backup['localLikes']]
        backup['assets'] = [{'sourceUrl': '/downloads/stations/test.webp', 'base64': base64.b64encode(b'file-content').decode()}]
        backup['localDocuments']['broadcast'] = [{'id': 'broadcast', 'data': {'text': 'Test'}}]
        backup['localDocuments']['checkins'] = []
        backup['localDocuments']['reports'] = []
        source = Path(self.directory.name) / 'roundtrip.json'
        source.write_text(json.dumps(backup))
        destination = Path(self.directory.name) / 'roundtrip.sqlite3'
        importer.import_backup(source, destination)
        self.assertEqual(importer.export_backup(destination), backup)


if __name__ == '__main__':
    unittest.main()
