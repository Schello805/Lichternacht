import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest
from unittest.mock import patch

from local_database import LocalDatabase
from station_numbering import load_plan, run_numbering

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('numbering_importer', ROOT / 'scripts' / 'prepare-local-db.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class StationNumberingTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root / 'local.sqlite3'
        self.plan = load_plan(ROOT / 'scripts' / 'flyer-numbering-2026.json')
        source = self.root / 'source.json'
        stations = [{'id': row['id'], 'name': row['name'], 'lat': 49 + row['id'] / 10000, 'lng': 10.55,
                     'desc': 'Adresse', 'offer': 'Angebot', 'image': f"/downloads/stations/{row['id']}.webp", 'tags': ['wc'], 'likes': 3} for row in self.plan['stations']]
        source.write_text(json.dumps({'format': 'lichternacht-full-backup', 'version': 3, 'appId': 'test',
            'stations': stations, 'events': [{'id': 'event', 'stationId': 20, 'title': 'Programm'}], 'config': {'defaultRouteStationIds': ['20', '23']}, 'assets': []}))
        importer.import_backup(source, self.path)
        self.database = LocalDatabase(self.path)
        self.database.write('set', 'checkins', 'user_20', {'ownerUid': 'user', 'stationId': '20'})
        self.database.like('user', '20')

    def digest(self):
        return hashlib.sha256(self.path.read_bytes()).hexdigest()

    def test_preview_does_not_change_database_or_create_backup(self):
        before = self.digest()
        result = run_numbering(self.path, self.plan)
        self.assertEqual(sum(row['old'] != row['new'] for row in result['changes']), 36)
        self.assertFalse(result['applied'])
        self.assertEqual(self.digest(), before)
        self.assertFalse((self.root / 'station-number-backups').exists())

    def test_apply_preserves_everything_except_display_numbers_and_marker(self):
        before = self.database.backup()
        result = run_numbering(self.path, self.plan, apply=True)
        after = self.database.backup()
        self.assertTrue(result['applied'])
        self.assertEqual(stat.S_IMODE(Path(result['backup']).stat().st_mode), 0o600)
        numbers = {station['id']: station['number'] for station in after['stations']}
        self.assertEqual(numbers[20], 26)
        self.assertEqual(numbers[23], 28)
        self.assertEqual(numbers[43], 43)
        self.assertEqual(set(numbers.values()), set(range(1, 44)))
        for station in after['stations']:
            station.pop('number')
        after['config'].pop('stationNumbering')
        before.pop('createdAt')
        after.pop('createdAt')
        self.assertEqual(before, after)
        with sqlite3.connect(result['backup']) as saved:
            snapshot = json.loads(saved.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()[0])
            self.assertNotIn('number', snapshot['stations'][0])
            self.assertEqual(saved.execute("SELECT count(*) FROM documents WHERE collection='checkins'").fetchone()[0], 1)
            self.assertEqual(saved.execute('SELECT count(*) FROM likes').fetchone()[0], 1)
        second = run_numbering(self.path, self.plan, apply=True)
        self.assertTrue(second['alreadyApplied'])
        self.assertFalse(second['applied'])
        self.assertEqual(len(list((self.root / 'station-number-backups').glob('*.sqlite3'))), 1)

    def test_identity_mismatch_aborts_without_backup_or_writes(self):
        self.database.write('set', 'stations', '20', {'name': 'Andere Station'}, True)
        before = self.digest()
        with self.assertRaisesRegex(ValueError, 'Identitätsprüfung'):
            run_numbering(self.path, self.plan, apply=True)
        self.assertEqual(self.digest(), before)
        self.assertFalse((self.root / 'station-number-backups').exists())

    def test_missing_station_and_backup_failure_do_not_write_any_numbers(self):
        with patch('station_numbering.create_backup', side_effect=OSError('disk full')):
            before = self.digest()
            with self.assertRaises(OSError):
                run_numbering(self.path, self.plan, apply=True)
            self.assertEqual(self.digest(), before)
        self.database.write('delete', 'stations', '43')
        with self.assertRaisesRegex(ValueError, '43 Stationen'):
            run_numbering(self.path, self.plan, apply=True)
        self.assertTrue(all('number' not in station for station in self.database.read()['stations']))

    def test_duplicates_are_refused_atomically_after_migration(self):
        run_numbering(self.path, self.plan, apply=True)
        before = self.database.backup()
        with self.assertRaisesRegex(ValueError, 'bereits vergeben'):
            self.database.write('set', 'stations', '20', {'number': 28}, True)
        self.assertEqual(self.database.read()['stations'], before['stations'])
        with self.assertRaisesRegex(ValueError, 'positive ganze Zahl'):
            self.database.write('set', 'stations', '20', {'number': True}, True)
        self.assertEqual(self.database.read()['stations'], before['stations'])
        self.database.write('set', 'stations', '20', {'number': 44}, True)
        self.assertEqual(next(station for station in self.database.read()['stations'] if station['id'] == 20)['number'], 44)
        with self.assertRaises(ValueError):
            run_numbering(self.path, self.plan, apply=True)

    def test_write_failure_after_backup_rolls_back_the_complete_change(self):
        with sqlite3.connect(self.path) as database:
            database.execute("CREATE TRIGGER reject_numbering BEFORE UPDATE ON snapshot BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END")
        before = self.digest()
        with self.assertRaises(sqlite3.IntegrityError):
            run_numbering(self.path, self.plan, apply=True)
        self.assertEqual(self.digest(), before)
        self.assertTrue(all('number' not in station for station in self.database.read()['stations']))
        self.assertEqual(len(list((self.root / 'station-number-backups').glob('*.sqlite3'))), 1)

    def test_plan_requires_complete_unique_numbering_and_missing_database_is_not_created(self):
        invalid = copy.deepcopy(self.plan)
        invalid['stations'][0]['number'] = 2
        source = self.root / 'invalid.json'
        source.write_text(json.dumps(invalid))
        with self.assertRaises(ValueError):
            load_plan(source)
        missing = self.root / 'does-not-exist.sqlite3'
        with self.assertRaises(FileNotFoundError):
            run_numbering(missing, self.plan, apply=True)
        self.assertFalse(missing.exists())
