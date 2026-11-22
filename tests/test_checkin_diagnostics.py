import json
import time
import unittest
from unittest.mock import patch
from pathlib import Path

import test_local_api as api_tests
import test_local_database as database_tests


class CheckinDiagnosticsTest(unittest.TestCase):
    def setUp(self):
        database_tests.LocalDatabaseTest.setUp(self)
        for name, value in [('LOCAL_DATABASE_ENABLED', True), ('LOCAL_DATABASE_PATH', str(self.path))]:
            setting = patch.object(api_tests.server, name, value)
            setting.start()
            self.addCleanup(setting.stop)
        self.start = int(time.time() * 1000) - 60000
        self.end = self.start + 3600000
        self.database.write('set', 'config', 'config', {'checkinWindow': {'startMs': self.start, 'endMs': self.end}}, True)
        self.payload = {'action': 'checkinDiagnostic', 'token': 'a' * 64, 'eventKey': f'{self.start}:{self.end}', 'stationId': '1', 'stage': 'gps_missing', 'stages': ['attempt', 'gps_missing']}

    def handler(self, *args, **kwargs):
        return api_tests.LocalApiTest.handler(self, *args, **kwargs)

    def send(self, payload=None, user='visitor', admin=False):
        handler = self.handler('/api/local-data', payload or self.payload, user=user, admin=admin)
        handler.do_POST()
        return handler.responses[0]

    def test_verified_write_and_private_read_even_for_the_writer(self):
        self.assertEqual(self.send(user=None)[0], 403)
        self.assertEqual(self.send()[0], 200)
        for user, admin, expected in [(None, False, 403), ('visitor', False, 403), ('admin', True, 200)]:
            handler = self.handler('/api/local-data?collection=checkinDiagnostics', user=user, admin=admin)
            handler.do_GET()
            self.assertEqual(handler.responses[0][0], expected)
        self.assertEqual(self.send(admin=True)[0], 200)
        self.assertEqual(len(self.database.records('checkinDiagnostics')), 1)

    def test_minimal_schema_rejects_coordinates_identity_and_unknown_stages(self):
        for changes in [{'lat': 49}, {'ownerUid': 'private'}, {'stage': 'unknown'}, {'stages': ['attempt', {}]}, {'token': 'short'}, {'eventKey': 'previous-event'}]:
            status, result = self.send({**self.payload, **changes})
            self.assertEqual(status, 403)
            self.assertTrue(result['permanent'])
        self.assertEqual(self.database.records('checkinDiagnostics'), [])
        self.send()
        record = self.database.records('checkinDiagnostics')[0]['data']
        self.assertEqual(set(record), {'stationId', 'eventKey', 'createdAt', 'expiresAt', 'stage', 'stages'})

    def test_idempotent_attempt_merges_stages_and_keeps_confirmed_status(self):
        self.send()
        self.send()
        self.send({**self.payload, 'stage': 'synced', 'stages': ['attempt', 'local_saved', 'synced']})
        self.send()
        records = self.database.records('checkinDiagnostics')
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['data']['stage'], 'synced')
        self.assertEqual(set(records[0]['data']['stages']), {'attempt', 'gps_missing', 'local_saved', 'synced'})
        self.database.write('set', 'stations', '2', {'id': 2})
        self.assertEqual(self.send({**self.payload, 'stationId': '2'})[0], 403)

    def test_withdrawal_is_idempotent_and_does_not_require_current_event_configuration(self):
        self.send()
        self.database.write('set', 'config', 'config', {'checkinWindow': {}}, True)
        payload = {'action': 'checkinDiagnostic', 'token': 'a' * 64, 'forget': True}
        self.assertEqual(self.send(payload)[0], 200)
        self.assertEqual(self.send(payload)[0], 200)
        self.assertEqual(self.database.records('checkinDiagnostics'), [])

    def test_expired_diagnostics_are_purged_from_reports_and_backups(self):
        self.send()
        with patch('local_database.time.time', return_value=self.end / 1000 + 30 * 86400):
            self.assertNotIn('checkinDiagnostics', self.database.backup()['localDocuments'])
            self.assertEqual(self.database.records('checkinDiagnostics'), [])
            self.assertEqual(self.send()[0], 403)

    def test_backup_restore_preserves_unexpired_diagnostics(self):
        self.send()
        backup = Path(self.directory.name) / 'restored.json'
        backup.write_text(json.dumps(self.database.backup()))
        restored = Path(self.directory.name) / 'restored.sqlite3'
        database_tests.importer.import_backup(backup, restored)
        self.assertEqual(database_tests.LocalDatabase(restored).records('checkinDiagnostics'), self.database.records('checkinDiagnostics'))
