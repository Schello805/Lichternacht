# Veröffentlichungsablauf

- Nach jeder abgeschlossenen, zusammenhängenden Änderung automatisch committen und auf GitHub pushen.
- Die App-Version erhöhen und die Versions-/Cache-Kennungen mit `npm run version:sync` aktualisieren.
- `npm run verify` ausführen und die verpflichtenden GitHub-Prüfungen abwarten. Fehlgeschlagene Prüfungen vor einer Veröffentlichung beheben; keine Schutzregeln umgehen.
- Den geprüften Stand über einen Pull Request in `main` übernehmen und einen neuen GitHub-Release mit passendem `vX.Y.Z`-Tag veröffentlichen.
- Kein Deployment auf dem Produktivserver durchführen. Der Nutzer führt `deploy.sh` selbst aus.
- Im Abschluss Release-Version, Prüfstatus und den noch ausstehenden Server-Update-Schritt nennen.
