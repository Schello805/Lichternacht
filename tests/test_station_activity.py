import time
import unittest
from unittest.mock import patch

import test_local_database as database_tests
import test_local_api as api_tests


class StationActivityTest(unittest.TestCase):
    def setUp(self):
        database_tests.LocalDatabaseTest.setUp(self)
        for name, value in [('LOCAL_DATABASE_ENABLED', True), ('LOCAL_DATABASE_PATH', str(self.path))]:
            setting = patch.object(api_tests.server, name, value)
            setting.start()
            self.addCleanup(setting.stop)

    def handler(self, *args, **kwargs):
        return api_tests.LocalApiTest.handler(self, *args, **kwargs)

    def configure(self):
        now = time.time() * 1000
        self.database.write('set', 'config', 'config', {'checkinWindow': {'startMs': now - 60000, 'endMs': now + 3600000}}, True)

    def signal(self, token, present=True, user='visitor'):
        handler = self.handler('/api/local-data', {'action': 'stationActivity', 'stationId': '1', 'token': token, 'present': present, 'lat': 99, 'ownerUid': 'injected'}, user)
        handler.do_POST()
        self.assertEqual(handler.responses[0][0], 200)
        return handler.responses[0][1]

    def test_activity_deduplicates_and_matches_only_verified_checkins(self):
        self.configure()
        self.signal('a' * 64)
        self.signal('a' * 64)
        self.assertEqual(self.database.activity_summary(True)[0]['visits'], 1)
        self.assertEqual(self.database.activity_summary(False), [])
        self.signal('b' * 64)
        self.signal('c' * 64)
        self.assertEqual(self.database.activity_summary(False), [{'stationId': '1', 'level': 'low'}])
        for index in range(3, 21):
            self.signal(f'{index:064x}')
            if index in (9, 19, 20):
                self.assertEqual(self.database.activity_summary(False)[0]['level'], 'high' if index == 20 else 'medium')
        for index in range(3, 21):
            self.database.station_activity('visitor', {'token': f'{index:064x}', 'forget': True})
        self.database.checkin('other', {'stationId': '1'})
        self.assertFalse(self.signal('a' * 64, False)['checkedIn'])
        self.database.checkin('visitor', {'stationId': '1'})
        self.assertTrue(self.signal('a' * 64, False)['checkedIn'])
        summary = self.database.activity_summary(True)[0]
        self.assertEqual((summary['visits'], summary['checkedIn'], summary['checkinPercent']), (3, 1, 33.3))
        record = self.database.backup()['localDocuments']['stationActivity'][0]['data']
        self.assertFalse({'ownerUid', 'lat', 'lng', 'anonymousId'} & set(record))
        with patch('local_database.time.time', return_value=time.time() + 360):
            self.assertEqual(self.database.activity_summary(False), [])

    def test_access_withdrawal_window_and_expiry(self):
        self.configure()
        handler = self.handler('/api/local-data?collection=stationActivity&report=true')
        handler.do_GET()
        self.assertEqual(handler.responses[0][0], 403)
        handler = self.handler('/api/local-data?collection=stationActivity&report=true', user='admin', admin=True)
        handler.do_GET()
        self.assertEqual(handler.responses[0][0], 200)
        self.signal('a' * 64)
        handler = self.handler('/api/local-data', {'action': 'stationActivity', 'forget': True, 'token': 'a' * 64}, user='visitor')
        handler.do_POST()
        self.assertEqual(self.database.activity_summary(True)[0]['visits'], 0)
        with self.assertRaises(ValueError):
            self.database.station_activity('visitor', {'token': 'bad', 'stationId': '1', 'present': True})
        self.signal('b' * 64)
        with patch('local_database.time.time', return_value=time.time() + 31 * 86400):
            self.database.activity_summary(True)
        self.assertEqual(self.database.backup()['localDocuments'].get('stationActivity', []), [])
        with patch('local_database.time.time', return_value=time.time() + 7200):
            with self.assertRaises(ValueError):
                self.database.station_activity('visitor', {'token': 'c' * 64, 'stationId': '1', 'present': True})


if __name__ == '__main__':
    unittest.main()
