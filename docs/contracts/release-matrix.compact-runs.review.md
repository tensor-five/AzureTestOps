# Release Matrix – Korrektur kompakter Run-Antworten

## Ursache und Umfang

Die vom Nutzer bereitgestellte Azure-Antwort enthält 544 Runs. Kein Eintrag enthält das optionale `plan`-Objekt. Der bisherige Mapper fordert `plan.id` und verwirft daher sämtliche Einträge. Eine Offline-Ausführung des unveränderten Adapters mit genau dieser Antwort reproduziert 544 Rohdatensätze → 0 Domänen-Runs. Vier zuvor als unbestätigt gemeldete Runs sind in der Rohantwort bereits `Completed` und zählen jeweils ein `NotApplicable`-Ergebnis. Kundendaten bleiben außerhalb des Repositories.

Korrektur innerhalb des bestehenden Auftrags: Die bereits nach `planId` gefilterte Run-Abfrage fordert vollständige Run-Details an. Bei kompakten Antworten ohne Plan-Objekt liefert der angefragte Plan den Kontext. Explizite gültige Planinformationen und andere Metadaten bleiben erhalten; explizit ungültige Planinformationen werden nicht ersetzt. Die Zuordnung von Ergebnissen zu Testpunkten sowie die Schreib- und Bestätigungslogik bleiben unverändert. Es gibt keine zusätzlichen Schreibaufrufe oder Wiederholungen.

Microsoft dokumentiert `planId` als Filter nach Testplan und `includeRunDetails=true` für vollständige Run-Eigenschaften: https://learn.microsoft.com/en-us/rest/api/azure/devops/test/runs/list?view=azure-devops-rest-7.1

## Vertragsreferenz

- V4 `release-matrix.v4.html`, SHA-256 `92184250ef76fe23744ab2c82ba78d663bcff20848e69c1b9820d22d9b3b31c3`, RM4-07.
- Weitergeltend V3 `release-matrix.v3.html`, SHA-256 `9555894a8598f9da8e494949fbc765e7cc23f3ff25c402de94d9d42e42db6e14`, RM3-09.
- Fachliches Ziel bleibt: Ergebnis des konkreten physischen Testpunkts schreiben und über den bestehenden Leser bestätigen. Der technische Parserfehler wird behoben; kein neuer fachlicher Vertrag und keine Änderung eingefrorener Tests.

## Unabhängiges Test-Gate

Reviewer `review_compact_runs_tests` hat beide Vertrags-SHAs geprüft und das Gate ohne Findings freigegeben. Neue Spec SHA-256: `9633725b525c38a71d82ca040489a5f4b2ab78675cc5d7218e5abaa9620cea9a`. Vor Umsetzung: zwei erwartete Assertion-Fehler, eine unveränderte Baseline grün, keine Setupfehler. Testmanifest: `release-matrix.compact-runs.tests.json`.

| Vertragsreferenz | Neue Regression |
| --- | --- |
| RM4-07 / RM3-09 | Kompakte Runs bleiben mit angefragtem Plan erhalten; Filter und Pagination bleiben intakt. |
| RM4-07 / RM3-09 | Vorhandene Plan-Metadaten bleiben erhalten, explizit ungültige IDs werden weiterhin verworfen. |
| RM4-07 / RM3-09 | NotApplicable wird über den echten Adapter und bestehenden Usecase bestätigt; genau ein POST und zwei PATCHes. |

Die bestehenden 44 Matrix-Browsertests sichern weiterhin die übrigen UI-, Point- und Schreibregeln ab.

## Implementierungsnachweis

- Produktdiff ausschließlich im Test-Management-Adapter: vollständige Run-Details anfordern und Plan-Kontext nur bei fehlendem/null Plan-Objekt verwenden.
- Offline-Replay derselben unveränderten Nutzerantwort nach Korrektur: **544 Rohdatensätze → 544 Domänen-Runs**. Alle vier zuvor gemeldeten Runs werden als abgeschlossen erkannt. Kein Live-Azure-Zugriff und keine weiteren Runs erzeugt.
- Vollständige Unit-/Integrationstests: 859 grün. Matrix-Browsertests: 44 grün.
- Typecheck, Build, Cycle-Check (199 Dateien) und 29 eingefrorene Testmanifeste: grün.
- Coverage: Statements 87,31 %, Functions 87,23 %, Lines 87,79 % (konfiguriertes Gate bestanden); Branches 79,11 %.
- Nativer `codex review`: keine relevanten Findings; Filter/Pagination, enger Plan-Fallback und unveränderter Schreib-/Bestätigungspfad bestätigt. Review verifizierte Prüfsummen und Typecheck; die oben genannten Testläufe erfolgten separat.
