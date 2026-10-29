#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from station_numbering import load_plan, run_numbering


def main():
    parser = argparse.ArgumentParser(description='Flyer-Nummern sicher übernehmen; ohne --apply ausschließlich Vorschau.')
    parser.add_argument('--database', required=True, help='Pfad zur vorhandenen lokalen Veranstaltungsdatenbank')
    parser.add_argument('--apply', action='store_true', help='Nach Prüfung und Backup in einer Transaktion übernehmen')
    parser.add_argument('--confirm', help='Für --apply erforderlich: flyer-2026')
    parser.add_argument('--backup-directory', help='Optionales privates Verzeichnis außerhalb des Webroots')
    arguments = parser.parse_args()
    if arguments.apply and arguments.confirm != 'flyer-2026':
        parser.error('--apply benötigt zusätzlich --confirm flyer-2026')
    try:
        plan = load_plan(Path(__file__).with_name('flyer-numbering-2026.json'))
        result = run_numbering(arguments.database, plan, arguments.apply, arguments.backup_directory)
        for row in result['changes']:
            print(f"{row['old']:>2} → {row['new']:>2}  {row['name']}  (interne Kennung {row['id']} bleibt)")
        print(f"\n{sum(row['old'] != row['new'] for row in result['changes'])} sichtbare Nummern ändern sich; Genussgalerie bleibt 43.")
        if result['alreadyApplied']:
            print('Bereits vollständig übernommen. Keine Daten erneut geändert.')
        elif result['applied']:
            print('Übernommen. Sicherung: ' + result['backup'])
        else:
            print('Nur Vorschau: keine Daten oder Dateien geändert. Übernahme mit --apply --confirm flyer-2026.')
        print('Interne Kennungen, Koordinaten, Bilder, Links, Programme, Check-ins, Likes und gespeicherte Favoriten/Touren bleiben unverändert.')
    except Exception as error:
        print('Abgebrochen: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
