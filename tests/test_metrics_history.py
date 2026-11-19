import threading
from pathlib import Path
import tempfile
import sqlite3
import unittest
from unittest.mock import patch

from metrics_history import MetricsHistory, MetricsRecorder, ResourceSampler, RETENTION, WINDOW
import server


class MetricsHistoryTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.path = self.root / '.private/history.sqlite3'
        self.history = MetricsHistory(self.path)

    def test_persistence_window_retention_and_permissions(self):
        sample = {'cpuPercent': 25, 'memoryPercent': 50}
        now = 1800000000
        self.history.record(sample, now - RETENTION - 60)
        self.history.record(sample, now)
        self.history.record({'cpuPercent': 40}, now + 5)
        self.history.record(sample, now + WINDOW)
        restored = MetricsHistory(self.path)
        self.assertEqual(restored.read(now), [{'timestamp': now * 1000, 'cpuPercent': 40}])
        self.assertEqual(restored.read(now - RETENTION - 60), [])
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(ValueError):
            restored.read(float('nan'))

    def test_missing_history_is_empty_not_fake_measurements(self):
        self.assertEqual(self.history.read(1800000000), [])
        self.assertFalse(self.path.exists())

    def test_three_hour_views_preserve_the_entire_recording(self):
        start = 1800000000
        for hour in range(12):
            self.history.record({'cpuPercent': hour}, start + hour * 3600)
        self.assertEqual(WINDOW, 10800)
        for block in range(4):
            rows = self.history.read(start + block * WINDOW)
            self.assertEqual([row['cpuPercent'] for row in rows], list(range(block * 3, block * 3 + 3)))

    def test_existing_application_database_and_public_path_are_rejected(self):
        self.path.parent.mkdir()
        with sqlite3.connect(self.path) as database:
            database.execute('CREATE TABLE snapshot (data TEXT)')
        with self.assertRaises(ValueError):
            self.history.connect()
        with sqlite3.connect(self.path) as database:
            tables = database.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        self.assertEqual(tables, [('snapshot',)])
        with self.assertRaises(ValueError):
            MetricsHistory(self.root / 'public.sqlite3')

    def test_background_recorder_does_not_require_http_requests(self):
        saved = threading.Event()
        class History:
            def record(self, sample):
                saved.set()
        recorder = MetricsRecorder(History())
        recorder.start()
        try:
            self.assertTrue(saved.wait(timeout=3))
        finally:
            recorder.stop()
        self.assertFalse(recorder.thread.is_alive())

    def test_cgroup_cpu_interval_and_memory(self):
        cgroup = self.root / 'cgroup'
        cgroup.mkdir()
        (cgroup / 'cpu.max').write_text('100000 100000')
        (cgroup / 'cpu.stat').write_text('usage_usec 1000000\n')
        (cgroup / 'memory.max').write_text('1000')
        (cgroup / 'memory.current').write_text('400')
        sampler = ResourceSampler(self.root / 'missing', cgroup)
        with patch('metrics_history.time.monotonic', return_value=10):
            first = sampler.sample()
        self.assertIsNone(first['cpuPercent'])
        self.assertEqual(first['memoryPercent'], 40)
        (cgroup / 'cpu.stat').write_text('usage_usec 16000000\n')
        with patch('metrics_history.time.monotonic', return_value=40):
            second = sampler.sample()
        self.assertEqual(second['cpuPercent'], 50)
        self.assertEqual(second['cpuSource'], 'cgroup')

    def test_proc_fallback_and_missing_values(self):
        proc = self.root / 'proc'
        proc.mkdir()
        (proc / 'stat').write_text('cpu 10 0 10 80 0 0 0 0 10 0\n')
        (proc / 'meminfo').write_text('MemTotal: 1000 kB\nMemFree: 200 kB\nMemAvailable: 600 kB\n')
        sampler = ResourceSampler(proc, self.root / 'missing')
        sampler.sample()
        (proc / 'stat').write_text('cpu 20 0 20 100 0 0 0 0 10 0\n')
        sample = sampler.sample()
        self.assertEqual(sample['cpuPercent'], 50)
        self.assertEqual(sample['memoryPercent'], 40)
        self.assertEqual(sample['cpuSource'], 'proc')
        self.assertIsNone(ResourceSampler(self.root / 'missing', self.root / 'missing').sample()['cpuPercent'])

    def test_history_api_requires_admin_and_validates_start(self):
        handler = object.__new__(server.CustomHandler)
        handler.responses = []
        handler._send_json = lambda status, body: handler.responses.append((status, body))
        handler._verify_admin_token = lambda: False
        handler.path = '/api/system-metrics/history?start=1800000000000'
        handler.do_GET()
        self.assertEqual(handler.responses[-1][0], 403)
        handler._verify_admin_token = lambda: True
        with patch.object(server, 'METRICS_HISTORY_PATH', str(self.path)):
            handler.do_GET()
            self.assertEqual(handler.responses[-1][1]['samples'], [])
            self.assertEqual(handler.responses[-1][1]['end'] - handler.responses[-1][1]['start'], 10800000)
            handler.path = '/api/system-metrics/history?start=nan'
            handler.do_GET()
            self.assertEqual(handler.responses[-1][0], 400)
