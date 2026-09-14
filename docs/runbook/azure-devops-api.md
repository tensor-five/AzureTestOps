# Azure DevOps API Runbook

## Voraussetzungen

Der Nutzer ist lokal via `az login` angemeldet, hat die `azure-devops` Extension installiert, und Defaults sind gesetzt:

```bash
az devops configure --defaults organization=https://dev.azure.com/<org> project=<project>
```

## REST-Pfade

Alle Pfade sind adapter-interne Details und sollen nicht in UI-Komponenten verwendet werden.

- `GET /_apis/test/Plans/{planId}/suites?$asTreeView=true` - Suite-Tree
- `GET /_apis/test/Plans/{planId}/suites/{suiteId}/testcases` - Test Cases einer Suite
- `GET /_apis/test/Plans/{planId}/suites/{suiteId}/points?includePointDetails=true` - Test Points mit Paging via `x-ms-continuationtoken`
- `GET /_apis/test/runs?planId={planId}&$top=...&$skip=...` - alle Runs eines Plans
- `GET /_apis/test/Runs/{runId}/results?detailsToInclude=Point` - Results pro Run mit Paging via `$top`/`$skip`
- `GET /_apis/wit/workitems?ids=1,2,3` - chunked Hydration, maximal 200 IDs pro Request
- `PATCH /_apis/wit/workitems/{id}` - Relations setzen/entfernen (`System.LinkTypes.Related`)

## Aggregations-Matching

- `TestResult.testCase.id == TestCase.workItemId`
- `TestResult.testSuite.id == TestCase.suiteId`
- pro `(workItemId, suiteId)`: Result mit `max(completedDate)` gewinnt -> `lastOutcome`


## Reset to active

Das Ergebnis-Dropdown der Release Matrix setzt den eindeutigen physischen Testpunkt mit `PATCH /_apis/test/Plans/{planId}/Suites/{suiteId}/points/{pointId}?api-version=7.1` und `{ "resetToActive": true }` zurück. Es entsteht kein neuer Run. Die vorhandene Ergebnis-Historie bleibt bestehen. Referenz: [Azure Points Update](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/points/update?view=azure-devops-rest-7.1).

Die Anwendung bestätigt den Reset durch erneutes Lesen: genau derselbe Punkt, Zustand `Ready` oder `Active`, Outcome `Unspecified` und keine positiven Run-/Result-Referenzen. Nur bei genau einem Punkt für den Testfall in der Suite unterdrückt dieser Zustand ältere Resultate in der Projektion. Eine spätere Ausführung wird wieder regulär aggregiert.

`Unspecified` bleibt der Azure-Wert; beide Ansichten zeigen ihn als blaues **ACT / Active**. NotApplicable erscheint gelb und Failed rot. Bestätigte Änderungen aktualisieren die geladene Zuordnung im aktuellen Set-/Plan-/Azure-Kontext, ohne ihre offenen Relationsänderungen zu verwerfen.

Nach einem nicht bestätigten Schreibversuch meldet die API `MATRIX_RESET_UNCONFIRMED` mit `details.pointId`. Der Client sperrt weitere Schreibversuche für diese Zelle. Eine spätere Aktualisierung mit eindeutigem Active-Punkt kann die Sperre aufheben; der Reset wird niemals automatisch wiederholt. Diagnoseereignisse verwenden `[release-matrix.write]` mit `reset-point` und `confirm-active-point`, ohne rohe Azure-Antworten oder Zugangsdaten.

Bekannte Fehler vor dem Schreibversuch werden als `MATRIX_RESET_NOT_ATTEMPTED` gemeldet. Sie erlauben einen erneuten manuellen Versuch. Verlorene HTTP-Antworten und nicht eindeutig zuordenbare Server-/Proxyfehler bleiben dagegen bis zu einem bestätigenden Read gesperrt.
