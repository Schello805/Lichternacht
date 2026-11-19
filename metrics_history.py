import math
import os
from pathlib import Path
import sqlite3
import threading
import time


INTERVAL = 30
RETENTION = 30 * 86400
WINDOW = 12 * 3600


class ResourceSampler:
    def __init__(self, proc=Path('/proc'), cgroup=Path('/sys/fs/cgroup')):
        self.proc = proc
        self.cgroup = cgroup
        self.previous = None

    def sample(self):
        cpu = None
        cpu_source = 'unavailable'
        memory_source = 'unavailable'
        used = total = None
        try:
            counters = dict(line.split() for line in (self.cgroup / 'cpu.stat').read_text().splitlines())
            quota, period = (self.cgroup / 'cpu.max').read_text().split()
            available = len(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else (os.cpu_count() or 1)
            cores = min(float(quota) / float(period), available) if quota != 'max' else available
            counter = int(counters['usage_usec']) / 1_000_000
            current = ('cgroup', time.monotonic(), counter, cores)
            cpu_source = 'cgroup'
        except (OSError, ValueError, KeyError, ZeroDivisionError):
            try:
                values = [int(value) for value in (self.proc / 'stat').read_text().splitlines()[0].split()[1:9]]
                idle = values[3] + values[4]
                current = ('proc', sum(values), sum(values) - idle, 1)
                cpu_source = 'proc'
            except (OSError, ValueError, IndexError):
                current = None
        if current and self.previous and current[0] == self.previous[0] and current[3] == self.previous[3] and current[3] > 0:
            elapsed = current[1] - self.previous[1]
            consumed = current[2] - self.previous[2]
            if elapsed > 0 and consumed >= 0:
                cpu = round(min(100, max(0, consumed / elapsed / current[3] * 100)), 2)
        self.previous = current
        try:
            total = int((self.cgroup / 'memory.max').read_text().strip())
            used = int((self.cgroup / 'memory.current').read_text().strip())
            if total <= 0 or used < 0:
                raise ValueError('Invalid memory limits')
            memory_source = 'cgroup'
        except (OSError, ValueError):
            try:
                memory = {line.split(':')[0]: int(line.split()[1]) * 1024 for line in (self.proc / 'meminfo').read_text().splitlines()}
                total = memory['MemTotal']
                used = total - memory.get('MemAvailable', memory['MemFree'])
                memory_source = 'proc'
            except (OSError, ValueError, KeyError, IndexError):
                used = total = None
        return {'cpuPercent': cpu, 'memoryPercent': round(min(100, used / total * 100), 2) if total and used is not None else None,
                'memoryUsed': used, 'memoryTotal': total, 'cpuSource': cpu_source, 'memorySource': memory_source}


class MetricsHistory:
    def __init__(self, path):
        self.path = Path(path).absolute()
        if self.path.parent.name != '.private':
            raise ValueError('Metrics database requires a .private directory')

    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(self.path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.fchmod(descriptor, 0o600)
        os.close(descriptor)
        database = sqlite3.connect(self.path, timeout=5)
        tables = {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if tables - {'samples'}:
            database.close()
            raise ValueError('Metrics require a dedicated database')
        database.execute('CREATE TABLE IF NOT EXISTS samples (timestamp INTEGER PRIMARY KEY, data TEXT NOT NULL)')
        return database

    def record(self, sample, now=None):
        import json
        now = int(time.time() if now is None else now)
        database = self.connect()
        try:
            with database:
                database.execute('INSERT OR REPLACE INTO samples VALUES (?, ?)', (now // INTERVAL * INTERVAL, json.dumps(sample, allow_nan=False)))
                database.execute('DELETE FROM samples WHERE timestamp < ?', (now - RETENTION,))
        finally:
            database.close()

    def read(self, start):
        import json
        if not math.isfinite(start) or start < 0 or start > 253402257599:
            raise ValueError('Invalid start')
        if not self.path.exists():
            return []
        database = self.connect()
        try:
            return [{'timestamp': timestamp * 1000, **json.loads(data)} for timestamp, data in database.execute(
                'SELECT timestamp, data FROM samples WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp LIMIT 1440', (start, start + WINDOW))]
        finally:
            database.close()


class MetricsRecorder:
    def __init__(self, history, sampler=None):
        self.history = history
        self.sampler = sampler or ResourceSampler()
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True, name='resource-history')

    def run(self):
        while not self.stopped.is_set():
            try:
                self.history.record(self.sampler.sample())
            except Exception:
                print('Systemverlauf: Messwert konnte nicht gespeichert werden.', flush=True)
            self.stopped.wait(INTERVAL)

    def start(self):
        self.thread.start()

    def stop(self):
        self.stopped.set()
        self.thread.join(timeout=6)
