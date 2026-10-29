# Stationsnummern an den offiziellen Flyer anpassen

## Prinzip: nur sichtbare Nummern ändern

Die interne Kennung `id` bleibt unverändert. Das zusätzliche Feld `number` enthält
die sichtbare Nummer aus dem Flyer. Ohne dieses Feld zeigt die App wie bisher `id`.

Beispiel: Der Imkerverein bleibt intern Station `20`, wird aber als **26** angezeigt.
Kartenkoordinaten, Namen, Bilder, Angebote und Programmverknüpfungen ändern sich nicht.
Favoriten, Besuchslisten, Check-ins, Likes, gespeicherte Touren und bereits geteilte
Links wie `?station=20` verweisen weiterhin auf dieselbe Station. Der Link zeigt
nach der Umstellung also den Imkerverein mit der sichtbaren Nummer 26, nicht eine
andere Station mit dieser internen Kennung.

Die geprüfte Zuordnung steht in `scripts/flyer-numbering-2026.json`:
42 Flyer-Einträge plus Genussgalerie als zusätzlicher Eintrag **43**.
Es ändern sich 36 sichtbare Nummern. Alle 43 Einträge erhalten ein `number`-Feld.

## Ausführung auf dem Server

Zuerst Release **v1.4.307 oder neuer** installieren. `deploy.sh` führt die Migration
absichtlich **nicht** automatisch aus. Es sind keine Zugangsdaten nötig.

```bash
cd /var/www/html/Lichternacht
./deploy.sh
python3 scripts/renumber-stations-from-flyer.py --database /root/lichternacht-migration/local.sqlite3
```

Der letzte Befehl ist nur eine Vorschau: Er listet alte Nummer, Flyer-Nummer,
Stationsnamen und unveränderte interne Kennung. Es wird nichts übernommen.

Wenn die Zuordnung stimmt:

```bash
python3 scripts/renumber-stations-from-flyer.py --database /root/lichternacht-migration/local.sqlite3 --apply --confirm flyer-2026
```

Danach die App vollständig neu laden. Stichproben:

- Gessler: 7
- Brennerei Scheurer: 12
- Imkerverein: 26
- Gärtnerei Höhn: 28
- Accentra Outlet: 41
- TSV: 42
- Genussgalerie: 43

## Schutzmaßnahmen

- Der Datenbankpfad muss bereits existieren; eine leere Datenbank wird nicht angelegt.
- Genau 43 unveränderte interne Kennungen und die zugehörigen Namen werden geprüft.
  Bei abweichenden Daten, fehlenden Stationen oder unerwarteten vorhandenen Nummern
  bricht das Skript ab. Nicht mit einer geratenen neuen Zuordnung fortfahren.
- Vor der ersten Übernahme wird die komplette Veranstaltungs-SQLite-Datenbank mit
  der SQLite-Backup-API gesichert und mit `PRAGMA integrity_check` geprüft.
  Dateien haben Modus 600, das Backup-Verzeichnis Modus 700.
- Standardpfad: `/root/lichternacht-migration/station-number-backups/`.
  Alternativ `--backup-directory /anderer/privater/pfad` angeben; nicht im Webroot.
- Ein Schreib-Lock verhindert konkurrierende Schreibänderungen zwischen Prüfung,
  Backup und Übernahme. Alle neuen Nummern werden in **einer Transaktion** übernommen.
- Fehler führen zum Rollback. Ein fehlgeschlagenes Backup verhindert jede Übernahme.
- Das Skript ist wiederholbar: Bei bereits vollständig übernommener Zuordnung
  meldet es dies und schreibt weder erneut noch erstellt es weitere Backups.
- Auth-Datenbank und Bilddateien werden nicht verändert. Die vorhandene regelmäßige
  Komplettsicherung bleibt davon unabhängig wichtig. Das zusätzliche Backup sollte
  ebenfalls außerhalb des Servers aufbewahrt werden.

## Weitere Pflege

Nach der Umstellung bearbeitet das Feld „Stationsnummer“ die sichtbare Nummer,
nicht die interne Kennung. Doppelte Nummern werden serverseitig abgewiesen.
Neue Stationen erhalten eine freie interne Kennung und eine neue sichtbare Nummer.

Tabellenexporte enthalten jetzt `id` (stabile interne Kennung) und `number`
(sichtbare Flyer-Nummer). **Nicht die `id`-Spalte umnummerieren.** Bei alten Tabellen
ohne `number` bleibt die bereits gespeicherte sichtbare Nummer beim Import erhalten.
Programmspalten wie `stationId` bleiben interne Verknüpfungen.

Vor einer eventuellen Wiederherstellung des Vorher-Backups muss die API gestoppt
und die aktuelle Datenbank separat gesichert werden. Eine Wiederherstellung setzt
auch zwischenzeitliche Änderungen und Check-ins zurück; daher nicht unüberlegt
die laufende Datenbankdatei ersetzen. Ein automatischer Restore ist nicht enthalten.
