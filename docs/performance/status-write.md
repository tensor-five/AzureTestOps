# Statusspeicherung: gezielte Bestätigung

Stand: 14. September 2026. Vertragsfreie Optimierung gegenüber `main` bei `28119a49f387d20c357dde05b26bd6e28fe4318d`.

Nach einer Statusänderung werden nur die Mitgliedschaft des Testfalls, seine Testpunkte und der neu erzeugte Durchlauf samt konkretem Ergebnis gelesen. Die Anwendung zeigt den neuen Status erst, wenn Azure diese Identitäten, den angeforderten Outcome und den Abschluss bestätigt. Die Antwort enthält ausschließlich sieben Identitäts-/Statusfelder. Beide Ansichten übernehmen diese Felder für denselben physischen Punkt; Titel, Tags, Beziehungen und andere Suite-Vorkommen bleiben bestehen.

## Vorher-/Nachher-Messung

Test-Harness mit echten Adaptern und Use-Cases, ausschließlich die Azure-HTTP-Grenze ist durch Fixtures ersetzt. Jede Anfrage erhält 15 ms Transportverzögerung; gemessen wird die tatsächliche Wanduhrzeit. Pro Kombination drei unabhängige Durchläufe, Tabelle mit Median in Millisekunden. Der Initial-Read vor dem Speichern ist nicht enthalten. Vorher ist der bisherige automatische Matrix-Read nach dem Bestätigen enthalten; nachher entfällt er. Browser-Regressionen prüfen ausdrücklich, dass nach dem Speichern kein zusätzlicher Matrix-GET erfolgt.

| Suites | Historische Runs | Aktion | Azure-Requests vorher → nachher | Dauer in ms vorher → nachher |
|---:|---:|---|---:|---:|
| 20 | 10 | Failed | 78 → 10 | 325 → 103 |
| 20 | 10 | ResetToActive | 72 → 5 | 259 → 50 |
| 100 | 10 | Failed | 238 → 10 | 479 → 100 |
| 100 | 10 | ResetToActive | 232 → 5 | 419 → 50 |
| 20 | 500 | Failed | 1058 → 10 | 2272 → 100 |
| 20 | 500 | ResetToActive | 1052 → 5 | 2209 → 50 |
| 100 | 500 | Failed | 1218 → 10 | 2419 → 101 |
| 100 | 500 | ResetToActive | 1212 → 5 | 2361 → 52 |

Dies ist eine reproduzierbare Skalierungsmessung, keine Messung der Latenz einer echten Azure-Organisation. Azure-interne Suchzeiten, Netzwerk, Rate-Limits und zusätzliche Pagination können die tatsächlichen Werte beeinflussen. Eine Speicherung liest weiterhin alle Konfigurationen **des betroffenen Testfalls**, um mehrdeutige Punkte abzulehnen; ihre Anzahl darf die Requestzahl beeinflussen. Testplan- und Run-Historiengröße verursachen dagegen keine weiteren Abfragen.

Rohmessungen mit Einzelwerten, Endpoint-Zählern, Umgebung und Zeitstempel:
- [Vorher](status-write-before.json)
- [Nachher](status-write-after.json)

## Ablauf

Status setzen: zwei unabhängige Validierungs-GETs parallel; ein Run-POST; ein GET der Ergebnisse ausschließlich dieses neuen Runs; Ergebnis-PATCH und Run-PATCH nacheinander; vier Bestätigungs-GETs parallel. Summe: sieben GETs und drei Writes. Die generierte Result-ID wird nicht aus dem Testfall oder aus der Historie erraten.

Reset: zwei Validierungs-GETs parallel; ein `resetToActive`-PATCH; zwei Bestätigungs-GETs parallel. Summe: vier GETs und ein Write. Bestätigt wird ein eindeutiger aktiver Punkt mit `Unspecified` und ohne positive Run-/Result-Referenzen. Die UI zeigt dafür Active.

Alle unabhängigen Reads werden auch bei einem Fehler vollständig abgewartet. Ein Write wird niemals automatisch wiederholt. Fehlende oder ungültige Antworten nach einem möglichen Write sperren einen erneuten Versuch. Ein nachweislich vor dem Write abgebrochener Vorgang bleibt manuell wiederholbar. Bestehende Sperren können durch einen späteren ausdrücklich ausgelösten Read mit passendem physischem Beleg aufgehoben werden; ein unbekannter Run wird nicht aus Fehlermeldungstext rekonstruiert.

Die UI führt pro Punkt nur die letzte Bestätigung mit einer Revision. Nur Antworten von Reads, die vor dieser Bestätigung gestartet wurden, erhalten das Delta. Ein später bewusst gestarteter Read kann neuere Azure-Werte übernehmen. Daten eines anderen Sets, Plans oder Azure-Kontexts werden nicht gepatcht.

Wenn nur am neuen Rohresult die Suite fehlt, bleibt eine bestätigte Änderung auch nach einem vollständigen Read sichtbar: Ein eindeutiger Punkt muss exakt auf dieses abgeschlossene, neuere Run-/Result-Paar zeigen, und Case, Point und Outcome müssen passen. Mehrere Konfigurationen, doppelte Ergebnisidentitäten, abweichende IDs, fehlender Abschluss oder ein älteres Datum erlauben diesen zusätzlichen Vorrang nicht. Es entstehen keine Zuordnungen allein anhand einer Testfall-ID.

## Reproduktion

Im aktuellen Checkout, nach `npm ci`:

```sh
./node_modules/.bin/esbuild tests/performance/status-write-benchmark.ts --bundle --platform=node --format=esm --outfile=/tmp/matrix-status-after.mjs
MATRIX_BENCHMARK_MODE=after node /tmp/matrix-status-after.mjs
```

Die Vorher-Messung wurde vor den Produktänderungen als eigenes Bundle erzeugt. Für eine Wiederholung: den oben angegebenen Baseline-Commit in einem separaten Checkout öffnen, die heutige Datei `tests/performance/status-write-benchmark.ts` unverändert dorthin kopieren, gegen die dortigen Produktdateien bündeln und mit `MATRIX_BENCHMARK_MODE=before` starten. Der Modus allein setzt Produktcode nicht auf den alten Stand zurück. `MATRIX_BENCHMARK_OUTPUT` überschreibt den Ausgabepfad. Standardmäßig liegt das JSON unter `/tmp/matrix-status-{mode}.json`.

## Messung gegen echtes Azure

Nach einem einzelnen Speichern in der Browser-Konsole und im Server-Terminal nach `[release-matrix.write-summary]` filtern. Über dieselbe `requestId` lassen sich beide Einträge verbinden:

- Browser: gesamte HTTP-Dauer bis zur Antwort, Ereignis `confirmed` oder `error`.
- Server: gesamte Bearbeitungszeit, `requestCount`, `readCount`, `writeCount`, `failedRequests`, `activeCount`, `maxConcurrent` und feste Operationsnamen.
- `httpElapsedMs` ist die Summe der Einzelanfragen und kann wegen Parallelität höher als die gesamte Bearbeitungszeit sein.

Bestehende `[release-matrix.write]`-Stufenlogs helfen weiterhin bei der Fehlerlokalisierung. Die neuen Messlogs enthalten keine URLs, Zugangsdaten, Bodies oder freie Azure-Fehlertexte. Die Messschicht führt weder Cache noch Retry ein. Bereits vorhandene sichere GET-Retries werden als echte zusätzliche Requests mitgezählt.

## Validierung

- 1.010 Unit-/Integrationstests, Zeilenabdeckung 88,48 %, Branch-Abdeckung 80,44 %.
- 77 Browser-Regressionen einschließlich exakter Requestzahlen, fehlendem Matrix-Reload und Aktualisierung beider Ansichten.
- Typecheck, Build und Cycle-Check bestanden.
- Unabhängiges Codex-Review: keine verbleibenden Findings; 136 betroffene Tests separat bestanden.
- Bestehende Testmanifeste wurden für die gezielten HTTP-Fixtures und Diagnose-Spies aktualisiert. Historische Vertragsartefakte bleiben unverändert; für diesen Auftrag wurde kein neuer Vertrag angelegt.

## Azure-API-Referenzen

- [Testfall in konkreter Suite](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/test-suites/get?view=azure-devops-rest-7.1)
- [Testpunkte mit Testfallfilter](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/points/list?view=azure-devops-rest-7.1)
- [Konkreter Durchlauf](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/runs/get-test-run-by-id?view=azure-devops-rest-7.1)
- [Konkretes Ergebnis mit Point-Details](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/results/get?view=azure-devops-rest-7.1)
