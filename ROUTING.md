# Fußwegplanung

Die Tourplanung verwendet den bestehenden Fußwegdienst von routing.openstreetmap.de.
Die Profilbezeichnung `driving` in dessen OSRM-URL ist kein Autoprofil: Der
Serverpfad `routed-foot` bestimmt hier das vorberechnete Fußwegenetz.
API-Referenz: https://project-osrm.org/docs/v5.24.0/api/

## Ablauf

- Eine Gehzeitenmatrix liefert die Kosten zwischen allen gewählten Stationen.
- Die beim Start erfasste GPS-Position ist der feste Ausgangspunkt. Es folgt
  jeweils die nächste noch gewählte Station nach Gehzeit auf dem Wegenetz.
  Diese Nächste-Nachbar-Heuristik garantiert kein globales Optimum.
- Ohne GPS können Stationen und Tourart ausgewählt und gespeichert werden.
  Erst beim Start wird mit frischem GPS gerechnet; ohne Standort startet keine Tour.
- Rundwege schließen an der gespeicherten GPS-Startposition, nicht an der ersten
  Station. Offene Strecken enden an der letzten Station. Bewegungen während der
  Tour verändern den gespeicherten Ausgangspunkt nicht.
- Die orange Tourgeometrie folgt dem Wegenetz. Der blaue Weg zum aktuellen Ziel
  wird separat berechnet. Die Gesamttour enthält den ursprünglichen Anweg und
  beim Rundweg den Rückweg zur Startposition, aber keine Aufenthalte.
- Bei Bewegung wird der Zielweg höchstens alle 20 Sekunden neu berechnet;
  mindestens 10 Meter Bewegung sind erforderlich. Zielwechsel werden sofort
  verarbeitet. Nach einem Fehler wird frühestens nach einer Minute erneut versucht.
- Frisches GPS und höchstens 20 Meter Abstand zum Stationspunkt sind für die
  manuelle Ankunftsbestätigung erforderlich. GPS bewegt die Tour niemals
  selbstständig zur nächsten Station. Überspringen bleibt eine bewusste Aktion.

## Fehler und Grenzen

Netzfehler und HTTP-5xx werden einmal erneut versucht, HTTP-4xx nicht.
Jeder Versuch ist auf zehn Sekunden begrenzt. Erfolgreiche Antworten bleiben
höchstens zehn Minuten in einem begrenzten Arbeitsspeicher-Cache; GPS-Punkte
werden dafür nicht dauerhaft gespeichert. Tourwechsel und Abbruch verwerfen
alte Antworten und brechen ausstehende Anfragen ab.

Fehlende Verbindungen, unplausible Antworten und Positionen mit mehr als 100 Metern
Abstand zum erfassten Weg werden abgewiesen. Es gibt keinen Luftlinien-Ersatz
für eine Straßenroute und keinen automatischen Wechsel zu einem Autoprofil.
Wenn nur der Zielweg ausfällt, bleibt die Gesamttour erhalten; die Zielentfernung
wird ausdrücklich als Luftlinie angezeigt. Wege enden am nächstgelegenen
kartierten Weg, nicht zwangsläufig direkt am Gebäudeeingang.

Der externe Dienst ist weiterhin eine Verfügbarkeitsabhängigkeit. Für garantierte
Kapazität wäre ein eigener oder vertraglich abgesicherter Fußwegdienst nötig.
Aktuelle Sperrungen und private Zugänge hängen von der Qualität der Kartendaten ab.
Ein GPS-Praxistest vor Ort, insbesondere auf iOS, bleibt erforderlich.
