# Release-Matrix v3 – unabhängiges Test-Gate

Am 14. September 2026 hat der ausschließlich lesende Codex-Reviewer `review_matrix_v3_gate` das Test-Gate gegen `release-matrix.v3.html`, SHA-256 `9555894a8598f9da8e494949fbc765e7cc23f3ff25c402de94d9d42e42db6e14`, freigegeben.

Alle Anforderungen RM3-01 bis RM3-14 sind durch 31 neue v3-E2E-Szenarien vollständig und ohne fachliche Zusatzanforderungen abgedeckt. Ein zunächst potenziell leerer Write-Nachweis in H12 wurde vor der Freigabe durch eine exakte POST-Anzahl abgesichert. Der Reviewer bestätigte insbesondere die echte rohe v2-LowDB-Migration, beide Mehrdeutigkeitsformen, die Trennung von Suite-WIT-Tags und Testfall-Hydration sowie die aktive Scrollregression.

Typecheck, Vertrags-/Frozen-Prüfung und Diff-Prüfung waren erfolgreich. Repräsentative Browserläufe starteten die echte Anwendung mit HTTP-Server, Runtime, Adaptern und LowDB und scheiterten erwartungsgemäß ausschließlich an fehlenden v3-Assertions. Ausschließlich die Azure-HTTP-Grenze ist simuliert. Produktcode, DTOs und Ports wurden in der Testphase nicht geändert.

Die geprüften neuen Specs, der v3-Harness, die aktive Scrollregression und die Playwright-Auswahl sind in `release-matrix.v3.tests.json` eingefroren. Historische v1/v2-Artefakte bleiben byteidentisch erhalten.
