# Begrenzter lokaler API-Lasttest

## Sicherheit und Umfang

`scripts/load-test-local.py` startet den echten API-Handler auf einem freien
Loopback-Port. Es importiert 43 synthetische Stationen und 12 Programmpunkte
in eine neue temporäre App-SQLite und legt eine separate temporäre Auth-SQLite an.
Die aktuelle Umgebung wird beim Serverimport nicht übernommen; die produktive
`.env` wird nicht gelesen. Kein URL-/Datenbankpfad-Parameter, keine Produktionsdaten,
keine Passwörter oder Sitzungstoken in der Ausgabe. Alle ausgehenden TCP-Verbindungen
außer Loopback werden für diesen Test blockiert. Temporäre Daten werden entfernt.

Getestet werden öffentliche Datenabrufe, Local-Auth-Sitzungsabrufe, Anwesenheit,
Check-in-Schreibzugriffe und korrekt verweigerte private Datenabrufe. Erwartete
403-Antworten zählen nicht als Fehler. Reale Schutzprüfungen und Limits bleiben
aktiv. Beide Datenbanken werden anschließend mit `PRAGMA integrity_check` geprüft.

## Ausführen

```sh
python3 scripts/load-test-local.py --requests 600 --concurrency 12
```

Grenzen: 10–2000 Anfragen, 1–24 parallele Verbindungen, höchstens zweimal so viele
synthetische Besuchersitzungen wie Verbindungen. Der Lauf wird bei unerwarteten
Antworten oder Integritätsfehlern mit Fehlerstatus beendet. Ausgegeben werden
Durchsatz sowie p50-/p95-/Maximallatenz und Statuszähler. Keine echten Feedback- oder
Resetmails und keine Anfragen an Karten-/Routinganbieter.

## Aussagegrenzen

Das ist ein lokaler Funktion-/Kapazitätsindikator, **kein Nachweis für eine
bestimmte Besucherzahl am Veranstaltungsabend**. Nicht enthalten: Apache/TLS,
LXC-Ressourcen, Mobilfunk, Bilder-/Kartendownloads, Browser-Rendering, gleichzeitige
Adminpasswortprüfungen oder die Verfügbarkeit fremder Routingserver.
Ein schneller Lauf auf dem Entwicklungsrechner ist kein Produktions-Benchmark.

Vor einem tatsächlichen Serverlasttest braucht es eine isolierte Testkopie,
festgelegte Last-/Abbruchgrenzen, Ressourcenüberwachung und einen geeigneten
Zeitpunkt. Nicht ungeprüft auf den produktiven Server übertragen. Die produktive
Apache-Konfiguration separat kontrollieren: nur `/api/` proxien, statische Dateien
direkt ausliefern und den Python-Port nicht öffentlich zugänglich machen.

Das reine Backlog-Limit von 128 ist weder eine Besuchergrenze noch ein Nachweis,
dass 128 aktive Datenbank-/Authentifizierungsanfragen sinnvoll gleichzeitig laufen.

## Messung am 14.11.2026

Entwicklungsrechner: macOS, Python 3.14.7. Synthetische HTTP-Last mit 20 Prozent
Schreibzugriffen (Anwesenheit/Check-in), Sitzungs-/Datenabrufen und zehn Prozent
absichtlich verweigerten privaten Lesezugriffen. Kein Passwort-Hashing im Messfenster.

| Parallel | Anfragen | Unerwartete Antworten/Fehler | p95 | Maximum | Integrität App/Auth |
| ---: | ---: | ---: | ---: | ---: | :--- |
| 4 | 600 | 0 | 6,0 ms | 40,3 ms | ok / ok |
| 12 | 600 | 0 | 18,9 ms | 256,5 ms | ok / ok |
| 24 | 1000 | 0 | 45,7 ms | 472,5 ms | ok / ok |

Diese kurzen lokalen Läufe zeigen keinen Fehler in diesem Szenario. Aus ihnen
lässt sich weder eine zugesicherte LXC-Kapazität noch eine Zahl gleichzeitig
nutzbarer Browser am Veranstaltungsabend ableiten. Apache-Konfiguration und
externe Routingkapazität wurden dabei nicht geprüft oder verändert.
