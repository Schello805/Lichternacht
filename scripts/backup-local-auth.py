import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_auth import LocalAuth

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Geschützte Auth-Sicherung ohne wiederverwendbare Sitzungen oder Resetlinks.')
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    arguments = parser.parse_args()
    if not Path(arguments.source).is_file():
        parser.error('Die bestehende Auth-Datenbank fehlt.')
    LocalAuth(arguments.source).backup(arguments.output)
    print('Auth-Sicherung erstellt und geprüft. Nach Wiederherstellung ist eine neue Anmeldung erforderlich.')
