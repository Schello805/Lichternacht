import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
import http.client
import importlib.util
import json
import os
from pathlib import Path
import platform
import socket
import sqlite3
import sys
import tempfile
import threading
import time
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def bounded_integer(minimum, maximum):
    def parse(value):
        number = int(value)
        if not minimum <= number <= maximum:
            raise argparse.ArgumentTypeError(f'Erlaubt: {minimum} bis {maximum}')
        return number
    return parse


def run(requests, concurrency):
    original_directory = Path.cwd()
    original_connect = socket.socket.connect

    def loopback_connect(connection, address):
        if not isinstance(address, tuple) or address[0] not in ('127.0.0.1', '::1'):
            raise OSError('Dieser Test erlaubt ausschließlich Loopback-Verbindungen.')
        return original_connect(connection, address)

    with tempfile.TemporaryDirectory(prefix='lichternacht-load-') as directory:
        directory = Path(directory)
        now = time.time()
        backup = {
            'format': 'lichternacht-full-backup', 'version': 3, 'appId': 'load-test',
            'stations': [{'id': number, 'name': f'Teststation {number}', 'offer': 'Synthetische Testdaten', 'tags': []} for number in range(1, 44)],
            'events': [{'id': f'event-{number}', 'title': f'Testprogramm {number}', 'time': '18:00'} for number in range(12)],
            'config': {'checkinWindow': {'startMs': (now - 60) * 1000, 'endMs': (now + 3600) * 1000}},
            'assets': []
        }
        source = directory / 'seed.json'
        source.write_text(json.dumps(backup), encoding='utf-8')
        specification = importlib.util.spec_from_file_location('load_test_importer', ROOT / 'scripts/prepare-local-db.py')
        importer = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(importer)
        database_path = directory / 'data.sqlite3'
        importer.import_backup(source, database_path)
        environment = {
            'LOCAL_DATABASE_ENABLED': 'true', 'LOCAL_DATABASE_PATH': str(database_path),
            'LOCAL_AUTH_ENABLED': 'true', 'LOCAL_AUTH_PATH': str(directory / '.private/auth.sqlite3'),
            'LOCAL_AUTH_ORIGIN': 'http://127.0.0.1', 'BIND_HOST': '127.0.0.1'
        }
        try:
            os.chdir(directory)
            with patch.dict(os.environ, environment, clear=True), patch.object(socket.socket, 'connect', loopback_connect), ExitStack() as runtime:
                import server

                runtime.enter_context(patch.multiple(server,
                    LOCAL_DATABASE_ENABLED=True, LOCAL_DATABASE_PATH=str(database_path),
                    LOCAL_AUTH_ENABLED=True, LOCAL_AUTH_PATH=environment['LOCAL_AUTH_PATH'],
                    LOCAL_AUTH_ORIGIN=environment['LOCAL_AUTH_ORIGIN'],
                    EMAIL_SETTINGS_PATH=str(directory / '.private/unused-email-settings.json')))

                class QuietHandler(server.CustomHandler):
                    def log_message(self, *arguments):
                        pass

                with server.ReusableTCPServer(('127.0.0.1', 0), QuietHandler) as listener:
                    port = listener.server_address[1]
                    server.LOCAL_AUTH_ORIGIN = f'http://127.0.0.1:{port}'
                    service = threading.Thread(target=listener.serve_forever, daemon=True)
                    service.start()

                    def request(path, payload=None, cookie=''):
                        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
                        try:
                            headers = {'Origin': server.LOCAL_AUTH_ORIGIN, 'Content-Type': 'application/json', 'Cookie': cookie}
                            connection.request('POST' if payload is not None else 'GET', path, json.dumps(payload) if payload is not None else None, headers)
                            response = connection.getresponse()
                            return response.status, json.loads(response.read()), response.getheaders()
                        finally:
                            connection.close()

                    try:
                        cookies = []
                        for _ in range(concurrency * 2):
                            status, body, headers = request('/api/local-auth/anonymous', {})
                            if status != 200 or not body.get('user', {}).get('isAnonymous'):
                                raise RuntimeError('Anonyme Testsitzung konnte nicht angelegt werden.')
                            cookies.append(next(value.split(';', 1)[0] for name, value in headers if name.lower() == 'set-cookie'))

                        def perform(index):
                            started = time.perf_counter()
                            cookie = cookies[index % len(cookies)]
                            kind = index % 10
                            try:
                                if kind == 0:
                                    status, body, _ = request('/api/local-data', {'action': 'set', 'collection': 'presence', 'data': {}}, cookie)
                                elif kind == 1:
                                    status, body, _ = request('/api/local-data', {'action': 'set', 'collection': 'checkins', 'data': {'stationId': str(index % 43 + 1)}}, cookie)
                                else:
                                    path = {
                                        2: '/api/local-auth/session', 3: '/api/local-data?collection=stations',
                                        4: '/api/local-data?collection=events', 5: '/api/local-data',
                                        6: '/api/local-data?collection=presence&count=true&since=2000-01-01T00:00:00Z',
                                        7: '/api/local-data?collection=config', 8: '/api/local-data?collection=users',
                                        9: '/api/local-data?collection=stats'
                                    }[kind]
                                    status, body, _ = request(path, cookie=cookie if kind == 2 else '')
                                valid = status == (403 if kind == 8 else 200) and bool(body.get('ok')) == (kind != 8)
                                return (time.perf_counter() - started) * 1000, status, valid
                            except (OSError, ValueError, http.client.HTTPException):
                                return (time.perf_counter() - started) * 1000, 'connection_error', False

                        started = time.perf_counter()
                        with ThreadPoolExecutor(max_workers=concurrency) as workers:
                            results = list(workers.map(perform, range(requests)))
                        elapsed = time.perf_counter() - started
                    finally:
                        listener.shutdown()
                        service.join(timeout=5)
                integrity = []
                for path in (database_path, Path(environment['LOCAL_AUTH_PATH'])):
                    with sqlite3.connect(path) as database:
                        integrity.append(database.execute('PRAGMA integrity_check').fetchone()[0])
                latencies = sorted(row[0] for row in results)
                return {
                    'scope': 'isolated loopback API with synthetic SQLite and Local Auth; no production, SMTP, static assets or external routing',
                    'python': platform.python_version(), 'platform': platform.system(),
                    'requests': requests, 'concurrency': concurrency, 'visitorSessions': len(cookies),
                    'seconds': round(elapsed, 3), 'requestsPerSecond': round(requests / elapsed, 1),
                    'p50Ms': round(latencies[len(latencies) // 2], 1),
                    'p95Ms': round(latencies[min(len(latencies) - 1, int(len(latencies) * 0.95))], 1),
                    'maxMs': round(latencies[-1], 1), 'errors': sum(not row[2] for row in results),
                    'statusCounts': dict(Counter(str(row[1]) for row in results)), 'integrity': integrity
                }
        finally:
            os.chdir(original_directory)


def main():
    parser = argparse.ArgumentParser(description='Begrenzter Lasttest ausschließlich auf einer isolierten lokalen API mit synthetischen Daten. Kein Ziel-URL-Parameter.')
    parser.add_argument('--requests', type=bounded_integer(10, 2000), default=600)
    parser.add_argument('--concurrency', type=bounded_integer(1, 24), default=12)
    arguments = parser.parse_args()
    result = run(arguments.requests, arguments.concurrency)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return int(result['errors'] > 0 or result['integrity'] != ['ok', 'ok'])


if __name__ == '__main__':
    raise SystemExit(main())
