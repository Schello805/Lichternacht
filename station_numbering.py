import copy
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import unicodedata
from datetime import datetime, timezone


def normalized_name(value):
    return ''.join(character for character in unicodedata.normalize('NFKD', str(value)).casefold() if character.isalnum())


def load_plan(path):
    plan = json.loads(Path(path).read_text(encoding='utf-8'))
    rows = plan.get('stations', [])
    if plan.get('migrationId') != 'flyer-2026' or len(rows) != 43:
        raise ValueError('Die geprüfte Flyer-Zuordnung mit 43 Stationen wird benötigt.')
    for key in ('id', 'number'):
        if any(type(row.get(key)) is not int for row in rows) or {row[key] for row in rows} != set(range(1, 44)):
            raise ValueError('Die Zuordnung muss jede Kennung und Nummer von 1 bis 43 genau einmal enthalten.')
    if any(not normalized_name(row.get('name', '')) for row in rows):
        raise ValueError('Stationsnamen zur Identitätsprüfung fehlen.')
    return plan


def prepare_numbering(snapshot, plan):
    stations = snapshot.get('stations')
    if not isinstance(stations, list) or len(stations) != 43 or not isinstance(snapshot.get('config'), dict):
        raise ValueError('Erwartet werden genau 43 Stationen und eine gültige Konfiguration. Keine Änderung vorgenommen.')
    by_id = {str(station.get('id')): station for station in stations}
    expected_ids = {str(row['id']) for row in plan['stations']}
    if len(by_id) != len(stations) or set(by_id) != expected_ids:
        raise ValueError('Die internen Stationskennungen unterscheiden sich von der geprüften Zuordnung.')
    digest = hashlib.sha256(json.dumps(plan, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    marker = snapshot['config'].get('stationNumbering')
    if marker and (marker.get('scheme') != plan['migrationId'] or marker.get('mappingSha256') != digest):
        raise ValueError('Eine andere Nummerierung wurde bereits eingespielt. Bitte zuerst prüfen.')
    result = copy.deepcopy(snapshot)
    target = {str(station['id']): station for station in result['stations']}
    changes = []
    for row in plan['stations']:
        station = by_id[str(row['id'])]
        if normalized_name(station.get('name')) != normalized_name(row['name']):
            raise ValueError(f"Identitätsprüfung fehlgeschlagen bei interner Kennung {row['id']}: {station.get('name')!r} statt {row['name']!r}.")
        if str(station.get('__docId', station['id'])) != str(station['id']):
            raise ValueError('Abweichende Dokumentkennungen: bitte manuell prüfen.')
        previous = station.get('number', station['id'])
        if type(previous) is not int or previous not in (station['id'], row['number']):
            raise ValueError(f"Unerwartete bestehende Nummer bei {row['name']}: {previous!r}.")
        if marker and station.get('number') != row['number']:
            raise ValueError('Die bereits migrierte Nummerierung wurde nachträglich geändert. Keine Wiederholung möglich.')
        changes.append({'id': station['id'], 'old': previous, 'new': row['number'], 'name': station['name']})
        target[str(station['id'])]['number'] = row['number']
    if not marker:
        result['config']['stationNumbering'] = {'scheme': plan['migrationId'], 'mappingSha256': digest, 'appliedAt': datetime.now(timezone.utc).isoformat()}
    return result, changes, bool(marker)


def create_backup(path, backup_directory):
    directory = Path(backup_directory).resolve()
    if directory.is_relative_to(Path(__file__).resolve().parent):
        raise ValueError('Das Backup muss außerhalb des Webroots gespeichert werden.')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if stat.S_IMODE(directory.stat().st_mode) & 0o077:
        raise ValueError('Das Backup-Verzeichnis muss privat sein (chmod 700).')
    name = 'before-flyer-numbering-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.sqlite3'
    destination = directory / name
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(descriptor)
    try:
        source = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=30)
        backup = sqlite3.connect(destination)
        try:
            source.backup(backup)
            if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Die Sicherung hat die Integritätsprüfung nicht bestanden.')
        finally:
            backup.close()
            source.close()
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return destination


def run_numbering(path, plan, apply=False, backup_directory=None):
    path = Path(path).resolve(strict=True)
    database = sqlite3.connect(path.as_uri() + ('?mode=rw' if apply else '?mode=ro'), uri=True, timeout=30)
    try:
        database.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
        row = database.execute('SELECT data FROM snapshot WHERE id = 1').fetchone()
        if not row:
            raise ValueError('Die Datenbank enthält keinen Veranstaltungssnapshot.')
        snapshot = json.loads(row[0])
        updated, changes, already_applied = prepare_numbering(snapshot, plan)
        backup = None
        if apply and not already_applied:
            backup = create_backup(path, backup_directory or path.parent / 'station-number-backups')
            database.execute('UPDATE snapshot SET data = ? WHERE id = 1', (json.dumps(updated, ensure_ascii=False),))
            database.commit()
        else:
            database.rollback()
        return {'changes': changes, 'alreadyApplied': already_applied, 'applied': apply and not already_applied, 'backup': str(backup) if backup else None}
    except BaseException:
        database.rollback()
        raise
    finally:
        database.close()
