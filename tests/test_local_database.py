import importlib.util
import json
import tempfile
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
                {'action': 'set', 'collection': 'users', 'id': 'attacker', 'data': {}}
            ])
        self.assertEqual(self.database.read(), previous)

    def test_likes_are_idempotent_per_user(self):
        self.database.like('visitor', '1')
        self.database.like('visitor', '1')
        self.assertEqual(self.database.read()['stations'][0]['likes'], 1)

    def test_import_does_not_overwrite(self):
        with self.assertRaises(FileExistsError):
            importer.import_backup(Path(self.directory.name) / 'backup.json', self.path)


if __name__ == '__main__':
    unittest.main()
