# Release Matrix – Schreibdiagnose

Der Nutzer hat nach nicht bestätigten `NotApplicable`-Änderungen eine weitere Debug-Runde mit zusätzlichem Logging ausdrücklich beauftragt. Dieser Nachweis erweitert das fachliche Verhalten nicht.

## Referenz und unabhängiges Test-Gate

- Vertrag v4: `release-matrix.v4.html`, SHA-256 `92184250ef76fe23744ab2c82ba78d663bcff20848e69c1b9820d22d9b3b31c3`.
- Weitergeltender Vertrag v3: `release-matrix.v3.html`, SHA-256 `9555894a8598f9da8e494949fbc765e7cc23f3ff25c402de94d9d42e42db6e14`.
- RM4-07 / RM3-09: physischer Testpunkt, genau ein manueller Run, unveränderte Ergebnisbestätigung und Fehlersemantik.
- Neuer Testumfang ausschließlich für autorisierte Diagnose und unverändertes Schreiben: `release-matrix.write-diagnostics.tests.json`.
- Unabhängiger lesender Review `review_write_diagnostics_tests`: alle zwölf Tests starten sauber und sind vor Umsetzung ausschließlich wegen fehlender Diagnoseevents assertion-rot; keine blockierenden Findings.

## Zuordnung der Prüfungen

| Referenz / autorisierter Diagnosezweck | Testabdeckung |
| --- | --- |
| RM4-07 / RM3-09, unverändertes NotApplicable-Schreiben | Usecase-Spec: erfolgreiche physische Schreibfolge; Routen-Spec: erfolgreicher POST |
| Keine weiteren Runs durch Diagnose | Usecase-Spec: leere Run-/Result-Liste und PATCH-Fehler, jeweils unveränderte Anzahl Schreiboperationen |
| Fehlerstelle unterscheiden | Usecase-Spec: find-result, complete-result, confirm-run; Routen-Spec: fehlgeschlagene Bestätigung |
| Sichere Diagnosefelder und HTTP-Status | Usecase-Spec: Feld-Allowlist, unbekannter Status, bekannter HTTP400, unbekannte/ungültige Fehlermuster; Routen-Spec: keine Header, Kontexte oder Rohfehler |
| Diagnose beeinflusst Schreiben nicht | Usecase-Spec: Logger wirft; Routen-Spec: ungecachter Service-Modus bleibt erhalten |
| Zusammengehörige Logeinträge | Routen-Spec: gemeinsame validierte Request-ID und Laufzeit |

## Reproduktion und nächste Debug-Runde

Im isolierten Test-Harness wurde der vorhandene Fehlerpfad reproduziert: Bei leerer normalisierter Run-Liste scheitert die Bestätigung auch nach erfolgreichen Ergebnis- und Run-PATCHes. Das ist eine belegte Möglichkeit, noch keine bestätigte Ursache des konkreten Azure-Vorfalls.

Nach Update und Neustart der lokalen App erscheinen die neuen Einträge im **Server-Terminal** mit Präfix `[release-matrix.write]`. Für einen einzelnen beabsichtigten Speicherversuch alle Einträge derselben `requestId` kopieren, vom ersten `validate-target/start` bis zum letzten `complete` oder `error`. Die bestehenden `[release-matrix.read]`-Einträge des anschließenden Ladens helfen zusätzlich. Kein erneutes Speichern allein zur Bestätigung eines bereits angelegten Runs.

Stufen: `validate-target`, `create-run`, `find-result`, `complete-result`, `complete-run`, `confirm-run`, `confirm-projection`. Ein `complete` bei einer PATCH-Stufe bedeutet, dass der bestehende Adapter den Aufruf erfolgreich abgeschlossen hat. Erst `confirm-projection/complete` bestätigt den gesamten bisherigen Schreibablauf. Es werden keine vollständigen Azure-Antworten, Zugangsdaten, Titel, URLs oder Rohfehlermeldungen geloggt.

## Abschlussprüfungen

- Typecheck, Build, Cycle-Check (199 Dateien) und 28 eingefrorene Testmanifeste: grün.
- Vollständige Unit-/Integrationstests: 856 Tests in 151 Dateien grün.
- Matrix-Browsertests: 44 grün.
- Coverage: Statements 87,29 %, Functions 87,23 %, Lines 87,77 %; konfiguriertes 80-%-Gate bestanden. Branches 78,97 %.
- Nativer `codex review`: keine relevanten Befunde; unveränderte Azure-Aufrufe, Bestätigungs- und Fehlerlogik bestätigt.
- Initiale Sandbox-Ausführung scheiterte ausschließlich an lokalen Testserver-Ports; Wiederholung mit erlaubten Ports erfolgreich.
- Kein neuer Live-Schreibversuch gegen Azure vorgenommen. Konkrete Ursache wird anhand der nächsten Nutzerlogs eingegrenzt.
