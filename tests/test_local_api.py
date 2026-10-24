import io
import json
import unittest
from unittest.mock import patch

import server
import test_local_database as database_tests


class LocalApiTest(unittest.TestCase):
    def setUp(self):
        database_tests.LocalDatabaseTest.setUp(self)
        self.enabled = patch.object(server, 'LOCAL_DATABASE_ENABLED', True)
        self.location = patch.object(server, 'LOCAL_DATABASE_PATH', str(self.path))
        self.enabled.start()
        self.location.start()
        self.addCleanup(self.enabled.stop)
        self.addCleanup(self.location.stop)

    def handler(self, path, payload=None, user=None, admin=False):
        handler = object.__new__(server.CustomHandler)
        handler.path = path
        handler.headers = {}
        handler.rfile = io.BytesIO()
        handler.responses = []
        handler._send_json = lambda status, data: handler.responses.append((status, data))
        handler._read_json = lambda: payload
        handler._rate_limit = lambda *args: True
        def verify():
            handler._verified_firebase_user = {'localId': user, 'email': 'test@example.test'} if user else None
            return admin
        handler._verify_admin_token = verify
        return handler

    def test_anonymous_admin_reads_and_writes_are_denied(self):
        handler = self.handler('/api/local-data?collection=users')
        handler.do_GET()
        self.assertEqual(handler.responses[0][0], 403)
        handler = self.handler('/api/local-data', {'action': 'set', 'collection': 'users', 'id': 'visitor', 'data': {}}, 'visitor')
        handler.do_POST()
        self.assertEqual(handler.responses[0][0], 403)
        self.assertFalse(self.database.is_admin('visitor'))

    def test_private_checkins_are_only_readable_by_their_owner(self):
        self.database.write('set', 'checkins', 'owner_1', {'ownerUid': 'owner'})
        for user, expected in [('owner', 200), ('other', 403)]:
            handler = self.handler('/api/local-data?collection=checkins&id=owner_1', user=user)
            handler.do_GET()
            self.assertEqual(handler.responses[0][0], expected)
        self.database.write('set', 'checkins', 'owner_other_1', {'ownerUid': 'owner_other'})
        handler = self.handler('/api/local-data?collection=checkins&id=owner_other_1', user='owner')
        handler.do_GET()
        self.assertEqual(handler.responses[0][0], 403)

    def test_admin_can_update_core_and_auxiliary_data_atomically(self):
        handler = self.handler('/api/local-data', {'operations': [
            {'action': 'set', 'collection': 'stations', 'id': '2', 'data': {'name': 'Neu'}},
            {'action': 'set', 'collection': 'broadcast', 'id': 'broadcast', 'data': {'text': 'Nachricht'}}
        ]}, 'admin', True)
        handler.do_POST()
        self.assertEqual(handler.responses[0][0], 200)
        self.assertEqual(self.database.records('broadcast')[0]['data']['text'], 'Nachricht')

    def test_backup_requires_admin(self):
        handler = self.handler('/api/local-backup', user='visitor')
        handler.do_GET()
        self.assertEqual(handler.responses[0][0], 403)

    def test_feedback_limits_verified_visitors_separately_behind_shared_proxy(self):
        buckets = []
        for user in ('visitor-one', 'visitor-two'):
            handler = self.handler('/api/bug-report', {'text': 'Test'}, user=user)
            handler.headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer test'}
            handler._send_bug_report_email = lambda *args: None
            handler._rate_limit = lambda bucket, *args: buckets.append(bucket) or True
            handler.do_POST()
            self.assertEqual(handler.responses[0][0], 200)
        self.assertEqual(buckets, ['bug-report-user-visitor-one', 'bug-report-total', 'bug-report-user-visitor-two', 'bug-report-total'])

    def test_feedback_rejects_unverified_identity(self):
        handler = self.handler('/api/bug-report', {'text': 'Test'})
        handler.headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer invalid'}
        handler.do_POST()
        self.assertEqual(handler.responses[0][0], 403)

    def test_feedback_optional_location_is_in_email_only_and_has_clickable_map(self):
        messages = []
        for location in (None, {'lat': 49.158, 'lng': 10.552, 'accuracy': 12, 'capturedAt': '2026-10-24T12:00:00.000Z'}):
            payload = {'text': 'Test'}
            if location:
                payload['location'] = location
            handler = self.handler('/api/bug-report', payload)
            handler.headers = {'Content-Type': 'application/json'}
            handler._send_bug_report_email = lambda *args: messages.append(args)
            handler.do_POST()
            self.assertEqual(handler.responses[0][0], 200)
        self.assertEqual(messages[0][1], 'Test')
        self.assertNotIn('openstreetmap.org', messages[0][2])
        self.assertIn('49.158000, 10.552000', messages[1][1])
        self.assertIn('Genauigkeit: ca. 12 m', messages[1][1])
        self.assertIn('<a href="https://www.openstreetmap.org/', messages[1][2])
        self.assertEqual(self.database.records('reports'), [])

    def test_feedback_invalid_locations_are_rejected_without_sending_mail(self):
        valid = {'lat': 49.158, 'lng': 10.552, 'capturedAt': '2026-10-24T12:00:00Z'}
        for changes in ({'lat': True}, {'lat': 91}, {'lng': float('nan')}, {'accuracy': -1}, {'capturedAt': '<script>'}):
            handler = self.handler('/api/bug-report', {'text': 'Test', 'location': {**valid, **changes}})
            handler.headers = {'Content-Type': 'application/json'}
            handler._send_bug_report_email = lambda *args: self.fail('Invalid coordinates must not be sent')
            handler.do_POST()
            self.assertEqual(handler.responses[0][0], 400)
