# Freiwillige Stationsstatistik

Gemeinsames Cookie-Banner unter Hilfe → Datenschutz & Cookies: „Alle erlauben“
aktiviert Matomo und Stationsstatistik, „Nur notwendige“ lehnt beides ab.
Unter „Einstellungen“ sind einzelne Zwecke wählbar; Änderungen gelten erst nach
„Auswahl speichern“. Bestehende reine Matomo-Einwilligungen werden nicht erweitert.
Kein zusätzliches GPS,
keine Koordinatenübertragung; vorhandene frische GPS-Messungen werden lokal
ausgewertet. Nur die nächste Station innerhalb 20 m, mindestens 20 Sekunden
mit aktualisiertem GPS; Genauigkeit höchstens 30 m. Meldungen höchstens einmal
pro Minute und Station, nur bei sichtbarer App und im Check-in-Zeitfenster.

Zufällige 256-Bit-Kennungen je Station/Veranstaltung erlauben Näherungszählung
und Zuordnung eines serverseitig bestätigten Check-ins. Keine Nutzer-ID wird im
Statistikdatensatz gespeichert. Bei Check-in und Rücknahme wird die vorhandene
Stationskennung im selben Schreibvorgang für die Quote verwendet, aber nicht
zusätzlich im Check-in-Datensatz gespeichert. Eine weitere GPS-Meldung ist dafür
nicht erforderlich. Authentifizierte Übertragung und technische
Logs sind deshalb nicht als vollständig anonyme Datenerhebung zu bezeichnen.
Datenschutzbeauftragten vor Veranstaltungsbetrieb das konkrete Verfahren prüfen
lassen; GPS-Freigabe oder eine frühere reine Matomo-Zustimmung ersetzen die
ausdrückliche Auswahl zur Stationsstatistik im gemeinsamen Banner nicht.

Öffentlich werden nur Kategorien veröffentlicht: 3–9 geringe, 10–20 mittlere,
mehr als 20 hohe Aktivität aus Signalen der letzten fünf Minuten. Unter drei
Signalen, außerhalb des Zeitfensters oder bei Fehlern keine Anzeige. Keine
Hochrechnung auf alle anwesenden Personen. Offline-/Hintergrundbesuche fehlen.

Adminanalyse und CSV enthalten erfasste Browserbesuche, davon eingecheckt sowie
die Quote. Check-ins ohne freiwillige Teilnahme bleiben separat. Detaildaten
liegen in `documents/stationActivity`, werden in JSON-Backups mitgesichert und
nach 30 Tagen bei der nächsten Statistikverarbeitung entfernt. Widerruf löscht
über die lokalen Kennungen, offline wird die Löschung vorgemerkt. Gelöschter
Browserspeicher verhindert die gezielte Löschung; Aufbewahrungsfrist bleibt.

Kein Nachweis tatsächlicher Anwesenheit: Standortentscheidung ist clientseitig,
Signale sind manipulierbar. Zufallskennungen und Rate-Limits begrenzen Missbrauch,
verhindern aber keine bewusste Mehrfachzählung. Nicht für Sicherheits- oder
Kapazitätsentscheidungen verwenden.
