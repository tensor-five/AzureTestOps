# Release-Matrix v2 – Implementierungsprüfung

Stand: 14. September 2026. Einzige fachliche Referenz: `release-matrix.v2.html`, SHA-256 `1ec76cfba36147cee4d480ebcb53a0342666aaa339f2092f4437266bd2221d1a`.

Der native Codex-Review hat einen Konflikt zwischen frei benannten Suite-Gruppen und Taggruppen beim gespeicherten Einklappzustand gefunden. Die Zustände werden jetzt getrennt persistiert; Regressionen prüfen beide Kollisionsnamen `untagged` und `tag:smoke` einschließlich Moduswechsel und Wiederherstellung. Der erneute native Review bestätigt den Fix und meldet keine verbleibenden relevanten Defekte. Produktansicht anhand eines Screenshots aus dem echten Browser-Harness visuell geprüft.

## Lokale Prüfungen

- Typecheck, Build und Cycle-Check erfolgreich (200 Dateien, keine Zyklen).
- 797 Unit-/Regressionstests erfolgreich.
- Coverage: Zeilen 87,46 %, Statements 86,88 %, Funktionen 86,81 %; die lokalen 80-Prozent-Gates bestehen.
- 67 von 67 aktiven Browser-Szenarien erfolgreich; darin 38 von 38 v2-Vertragsszenarien sowie beide Scrollregressionen.
- Sämtliche freigegebenen Vertrags- und eingefrorenen Testprüfsummen unverändert verifiziert.
- Bestehender Ergebnis-Aggregator, Projektions-Matching und manueller Schreib-Use-Case unverändert.

## Geschlossenes Test-Gate

Der erste vollständige v2-Lauf ergab 37/38 erfolgreiche Szenarien. C17 startet über seine vorbereitende `server.patch()`-Operation den Testserver neu, lädt die schon geöffnete Seite jedoch nicht neu. Dadurch bleibt ihr alter CSRF-Token ungültig und die Persistenzprüfung scheitert. Der unabhängige Test-Reviewer bestätigte die Ursache und empfiehlt ausschließlich `await page.reload()` unmittelbar nach `await server.patch(preserved)` in C17. Harness und Assertions bleiben dabei unverändert; die Produkt-CSRF-Prüfung darf nicht abgeschwächt werden.

Der Nutzer hat die Testkorrektur ausdrücklich freigegeben. Ausschließlich der Reload wurde ergänzt; Assertions, Harness und Produktcode blieben unverändert. Der unabhängige Reviewer bestätigte den Diff und gab das vollständige Test-Gate ohne Findings frei: 38 von 38 v2-Szenarien bestanden. Der neue Spec-Hash ist im Testmanifest und dessen Hash im Approval-Checker verankert. Remote-CI/Sonar sowie ein Live-Test gegen den Azure-Bestand des Nutzers sind durch die lokalen Ergebnisse nicht nachgewiesen.
