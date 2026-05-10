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
