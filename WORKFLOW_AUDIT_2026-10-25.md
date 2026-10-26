# Funktions- und Workflow-Prüfung vom 25.10.2026

Stand: v1.4.299, lokaler Quellcode. Keine Änderungen am Produktivsystem.
Die Prüfung ist eine gezielte Funktionsprüfung, kein Nachweis vollständiger Fehlerfreiheit.

## Befunde nach Priorität

### 1. Hoch: Datenverlust bei Änderung einer Stationsnummer möglich

- Quelle: `js/ui.js:1385`, `js/data.js:307`.
- Das Speichern löscht die alte Station und speichert erst danach die neue Nummer in einem zweiten Request.
- Im isolierten Browser reproduziert: Nummer 1 auf 999 ändern, Löschen erfolgreich simulieren, anschließendes Speichern mit Netzwerkfehler abbrechen. Request-Reihenfolge: DELETE 1, SET 999. Der lokale Datensatz trägt bereits 999, die aktive Stations-ID bleibt 1.
- Konsequenz: Der alte Serverdatensatz ist verloren, wenn der zweite Request scheitert. Auch ohne Nummernwechsel wird das lokale Objekt vor erfolgreichem Speichern verändert.
- Empfehlung: Umnummerierung als atomare Servertransaktion, einschließlich betroffener Verknüpfungen; lokale Änderungen erst nach Bestätigung übernehmen. Fehlgeschlagene Entwürfe zur erneuten Bearbeitung erhalten.

### 2. Mittel: Menüwechsel verwirft ungespeicherte Bearbeitung

- Quelle: `js/ui.js:309`, `js/ui.js:365`.
- Im isolierten Browser reproduziert: bestehende Station öffnen, bearbeiten, Titel ändern, auf Programm wechseln, Station erneut öffnen. Keine Rückfrage; alter Titel wird angezeigt, Bearbeitungsmodus beendet.
- Nur neue Stationsentwürfe haben eine Verwerfen-Abfrage. Bei bestehenden Stationen fehlt sie.
- Empfehlung: Gemeinsame Änderungsprüfung für Schließen, Tabwechsel und Wechsel zu einer anderen Station. Auswahl: Weiterbearbeiten oder Änderungen verwerfen; bei Seitenwechsel zusätzlich Browser-Warnung.

### 3. Mittel: Check-in rückgängig machen betrifft nur das Gerät

- Quelle: `js/gamification.js:248`.
- Die Funktion entfernt den lokalen Besuch und zeigt „Check-in rückgängig gemacht“. Sie schreibt lediglich ein Audit-Ereignis; der Server-Check-in bleibt bestehen. Eine noch ausstehende Offline-Aktion wird ebenfalls nicht entfernt.
- Konsequenz: Besucheransicht und serverseitige Check-in-Auswertung können auseinanderlaufen; ein offline zurückgenommener Check-in kann später noch hochgeladen werden.
- Empfehlung: Entweder konsistentes serverseitiges Rückgängigmachen einschließlich Warteschlange implementieren oder die Funktion ausdrücklich als rein lokale Markierung benennen.

### 4. Mittel: Offline-Check-ins nach Ende des Zeitfensters bleiben hängen

- Quellen: `local_database.py:148`, `js/offline-sync.js:65`, `js/gamification.js:457`.
- Der Browser markiert einen Besuch sofort lokal. Der Server akzeptiert neue Check-ins nur innerhalb des Zeitfensters zum Zeitpunkt des Empfangs; ein mitgelieferter früherer Zeitpunkt wird nicht anerkannt.
- Kommt das Gerät erst nach Ablauf des Fensters online, wird der Check-in abgelehnt. Die Queue behält fehlgeschlagene Aktionen und versucht sie alle 30 Sekunden erneut.
- Empfehlung: Verbindliche Offline-Regel definieren, dauerhafte Ablehnungen von temporären Netzwerkfehlern unterscheiden und im Lichter-Pass den Synchronisationsstatus anzeigen. Ungeprüfte Client-Zeitstempel nicht einfach als vertrauenswürdig übernehmen.

### 5. Mittel: Backup-Bedienung und Erklärung passen nicht zum lokalen Backend

- Quellen: `index.html:403`, `js/admin.js:1012`, `js/admin.js:1120`, `local_database.py:31`.
- Die Oberfläche bietet vollständiges Wiederherstellen an, lehnt aber den eigenen aktuellen JSON-Export mit `localDocuments` ab und verweist erst dann auf das Server-Importskript.
- Der Hilfetext behauptet außerdem, Besucher- und Analysedaten würden nicht exportiert. Der lokale Export enthält dagegen sämtliche vorhandenen Dokument-Sammlungen und lokale Likes, also gegebenenfalls Check-ins, Audit-Daten und Admin-E-Mail-Metadaten. Authentifizierungs-Passworthashes sind nicht Bestandteil dieses JSON-Exports.
- Empfehlung: Server-Restore vor der Dateiauswahl klar erklären; Export als vertrauliche Datensicherung kennzeichnen und enthaltene Daten korrekt beschreiben. Keine ungeschützte Ein-Klick-Wiederherstellung nachrüsten.

## Testumfang und Grenzen

- `npm run verify`: bestanden; 60 JavaScript-Tests, 38 Python-Tests, Build sowie Versions- und Syntaxprüfungen erfolgreich.
- Vollständige Browserprüfung: 151 von 160 Tests bestanden, neun Start-Timeouts nach jeweils 30 Sekunden. Alle neun scheiterten beim Warten auf `window.__appReady`, noch vor den eigentlichen Funktionsprüfungen. Das ist keine grüne Gesamtprüfung; die Ursache ist noch nicht eingegrenzt.
- Gezielte Wiederholung der neun fehlgeschlagenen Tests mit Trace: alle neun bestanden in 19,2 Sekunden. Das spricht für sporadisches Verhalten, beseitigt aber weder die Start-Timeouts noch deren ungeklärte Ursache. Nicht als fehlerfreien Erstlauf bewerten.
- Zwei zusätzliche isolierte Browser-Reproduktionen bestätigen Befund 1 und 2. Schreiboperationen wurden simuliert; keine Produktivdaten verändert.
- Ein isolierter Datenbanktest bestätigt die Ablehnung einer verspäteten Offline-Nachmeldung trotz Check-in-Zeitstempel innerhalb des Fensters sowie den Export vorhandener Audit-Daten.
- Die bestehende Browser-Suite nutzt Chromium mobil und Desktop, blockiert Service Worker und arbeitet überwiegend mit lokalem Fallback bzw. API-Mocks. Ein grüner Lauf beweist daher nicht den vollständigen Produktionsbetrieb mit SQLite, echten Sitzungen und PWA-Update-Cache.
- Für die Freigabe zusätzlich erforderlich: iPhone/iPad-Safari, echte GPS-Berechtigungen, installierte PWA inklusive Update/Offline-Neustart und durchgehender Test gegen eine isolierte lokale Auth-/Datenbankinstanz.

## Empfohlene Reihenfolge

1. Atomares Speichern und Schutz ungespeicherter Änderungen.
2. Einheitliche Check-in-/Offline-/Rückgängig-Semantik.
3. Backup-Texte und Restore-Führung korrigieren.
4. Neue Regressionstests für diese Fehlerfälle sowie Safari-/PWA-Abnahme ergänzen.

## Umsetzung nach Beauftragung

Die fünf Befunde sind im Arbeitsstand bearbeitet:

- Atomare Umnummerierung einschließlich Event-Verknüpfungen, Check-ins und
  Like-Sperren; keine Übernahme fehlgeschlagener Entwürfe in die Stationsliste.
- Verlassen-Schutz einschließlich Browser-Seitenwechsel; Bildänderungen bleiben
  bis zum Speichern im Entwurf. Laufendes Speichern verhindert Doppelklicks und
  konkurrierende Navigation.
- Besitzergebundene Check-in-Rücknahme mit Korrektur der Serverstatistik.
- Geordnete Offline-Warteschlange, dauerhafte Ablehnungen ohne Endlosschleife,
  sichtbarer Übertragungsstatus; Offline-Regel im Lichter-Pass erklärt.
- Vertraulichkeit und Umfang der Sicherung korrekt beschrieben; bei lokalem
  Backend wird der Server-Restore erklärt statt eines ungeeigneten Dateiimports.

Zusätzlich ist der Start gegen fehlerhafte Favoriten-Daten, hängende
Konfigurationsabfragen und fehlgeschlagene Karteninitialisierung abgesichert.
Das Abarbeiten der Offline-Warteschlange blockiert den Start nicht mehr.
Die Diagnose der ursprünglichen Start-Timeouts zeigte zurückgesetzte lokale
HTTP-Verbindungen beim Laden von JavaScript-Modulen (`ERR_CONNECTION_RESET`).
In diesen Fällen wurde `main.js` gar nicht ausgeführt. Die Listen-Warteschlange
des Python-Test-/API-Servers wurde deshalb auf 128 erhöht. Ein zusätzlicher
Modul-Ladefehler-Hinweis bietet Besuchern eine explizite Neu-laden-Aktion.
Die Tests zeichnen Startphase und fehlgeschlagene Requests zur Diagnose auf.

Eine zusätzliche Regression wurde während der Prüfung korrigiert: CSS-
Großschreibung der Adresse zählt nicht mehr als ungespeicherte Textänderung und
wird beim Speichern nicht versehentlich in die Daten übernommen.

### Abschließende lokale Abnahme

- `npm run verify`: erfolgreich; 63 JavaScript-Tests und 43 Python-Tests sowie
  Build, Versionsprüfung und Syntaxprüfungen bestanden.
- `npm run test:e2e`: **176 von 176 bestanden**, Chromium mobil und Desktop,
  vollständiger Lauf ohne Wiederholungen in 3,4 Minuten. Keine Start-Timeouts.
- Zusätzliche Regressionen decken atomare Umnummerierung/Rollback,
  Berechtigungen, Entwurfsverlust, Bildänderungen, Rücknahme ohne erneutes
  Einchecken, Offline-Reihenfolge, endgültige Ablehnung, Kontowechsel,
  Backup-Hinweise, Kartenfehler und fehlgeschlagene Modul-Downloads ab.
- `git diff --check`: ohne Beanstandung.
- Die genannten Grenzen bleiben: kein aktueller Produktivtest und kein
  physischer iPhone-/iPad-Safari- oder installierter PWA-Test.

Kein Commit, Release oder Deployment. Die Live-App ist unverändert.
