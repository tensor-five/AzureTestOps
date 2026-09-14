# Release-Matrix v2 – unabhängiges Test-Gate

Am 14. September 2026 hat der ausschließlich lesende Codex-Reviewer `review_matrix_v2_gate` das Test-Gate freigegeben. Einzige fachliche Referenz war `release-matrix.v2.html`, SHA-256 `1ec76cfba36147cee4d480ebcb53a0342666aaa339f2092f4437266bd2221d1a`.

Alle RM01–20 sind durch 38 v2-E2E-Szenarien nachvollziehbar abgedeckt. Keine verbleibenden relevanten Befunde oder fachlichen Zusatzanforderungen. Vor der Freigabe wurden Prüfungen für mehrfach gelieferte physische Suite-Datensätze, die Anzahl iterierter Select-Kopien und die tatsächliche horizontale Scrollbewegung ergänzt.

Der Harness startet echte Anwendung, HTTP-Server, Adapter, Ergebnis-Aggregator und LowDB. Ausschließlich die externe Azure-Grenze wird simuliert. Der repräsentative Browserlauf für S01, S06 und S11 bootete erfolgreich und scheiterte am noch fehlenden v2-Verhalten durch Assertions. Typecheck war erfolgreich. Das ist der RED-Nachweis der Testphase, kein Nachweis einer bereits erfolgreichen Implementierung.

Die geprüften Test- und Harness-Dateien sind in `release-matrix.v2.tests.json` eingefroren; der Manifest-Hash ist im Approval-Checker verankert. Historische v1-Artefakte bleiben byteidentisch erhalten. Playwright führt den aktiven v2-Vertrag aus und nimmt nur die historische v1-Matrix-Vertragsdatei aus der Discovery. Die bestehenden Scrollregressionen bleiben aktiv. CI-Auswahl und Workflow-Pfadfilter wurden ebenfalls unabhängig geprüft.
