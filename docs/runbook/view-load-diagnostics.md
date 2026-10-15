# Ladezeitdiagnose für Zuordnung und Release-Matrix

Beide Ansichten protokollieren automatisch ihre Datenabfragen. Keine zusätzliche Einstellung und keine produktiven Azure-Schreibzugriffe sind für die Messung nötig.

## Messung am anderen Rechner

1. Den aktuellen Stand von `main` holen, den bisherigen lokalen Server beenden und die Anwendung neu starten. Ein bereits laufender Server verwendet sonst weiterhin den alten Code.
2. Im Terminal des lokalen Servers die Zeilen mit `[relations.read]` und `[release-matrix.read]` sammeln. Jede Servermeldung enthält vollständiges JSON in genau einer Zeile.
3. In „Zuordnung“ einmal „Refresh“ drücken und bis zum Abschluss warten. Anschließend zur „Release-Matrix“ wechseln und auch dort einmal „Refresh“ drücken. Das explizite Aktualisieren umgeht den bestehenden Matrix-Snapshot-Cache.
4. Alle Zeilen vom jeweiligen `start` bis `complete`, `error` oder `aborted` schicken. Bei einem Hänger auch die regelmäßigen `pending`-Zeilen mitschicken. Zwei weitere Wiederholungen helfen, den ersten Abruf von wiederholten Abrufen zu unterscheiden.
5. Bei Bedarf zusätzlich die Browserkonsole nach denselben Präfixen filtern und kopieren. `requestId` verbindet Browser und Server. Die Zuordnung überträgt die UUID als SSE-Queryparameter, die Matrix im vorhandenen Header `x-matrix-request-id`.

Zum Mitschneiden bei einem manuellen Serverstart nach dem Build:

```sh
npm run start:local 2>&1 | tee /tmp/azuretestops-load.log
```

Unter PowerShell:

```powershell
npm run start:local 2>&1 | Tee-Object -FilePath "$env:TEMP\azuretestops-load.log"
```

Es genügen die Diagnosezeilen mit den beiden Präfixen; andere Terminalausgaben werden für die Auswertung nicht benötigt.

## Auswertung

`timestamp` ist UTC; `elapsedMs` ist die Gesamtdauer seit Beginn dieses Datenabrufs in Millisekunden. `side` unterscheidet Browser und Server. Browsermessungen enden nach Empfang und Verarbeitung des Datenpakets, vor dem anschließenden React-Rendering. Sie messen keine Zeit bis zum fertig gezeichneten Bildschirm. Beim Zurückwechseln zu einer noch gültig gecachten Matrix entsteht keine neue HTTP-Abfrage und entsprechend kein neuer Read-Log.

Jede Abschlussmeldung und jede `pending`-Meldung enthält `operations`. Pro Operation stehen dort:

| Feld | Bedeutung |
| --- | --- |
| `calls` | Gestartete Aufrufe |
| `completed` | Ohne geworfenen Fehler beendete Aufrufe |
| `failed` | Mit geworfenem Fehler beendete Aufrufe |
| `totalMs` | Summe der Dauern beendeter Aufrufe |
| `maxMs` | Längster beendeter Aufruf |

Parallel laufende Aufrufe und geschachtelte Messungen überlappen sich: `totalMs` darf höher als `elapsedMs` sein und die Operationen dürfen nicht zu einer Gesamtladezeit addiert werden. HTTP-Aufrufe mit Fehlerstatus sind empfangene Antworten; der Status wird separat gezählt. Noch laufende Operationen haben bereits einen Aufruf, aber noch keine abgeschlossene Dauer. `activeCount` und bis zu fünf `active`-Einträge zeigen laufende Operationen und deren bisherige Dauer. `aborted` beendet die Diagnose sofort; zu diesem Zeitpunkt noch laufende Aufrufe sind in den Abschlussdauern nicht enthalten.

| Operation | Bedeutung |
| --- | --- |
| `catalog`, `tree` | Suite-Katalog und Hierarchie |
| `cases`, `points` | Direkte Mitgliedschaften und Testpunkte je Suite |
| `runs`, `results` | Durchläufe des Plans und Ergebnisse je Durchlauf; Port-Dauern enthalten Paging und Retry-Wartezeiten |
| `hydrate` | Work-Item-Anreicherung der Testfälle |
| `query`, `work-items` | Gespeicherte Abfrage und deren Work-Item-Anreicherung in der Zuordnung |
| `phase.context`, `phase.test-cases`, `phase.saved-query` | Dauer der bestehenden Zuordnungs-Ladephasen; Testfälle und gespeicherte Abfrage laufen parallel |
| `http.suites`, `http.cases`, `http.points`, `http.runs`, `http.results`, `http.hydrate`, `http.query`, `http.other` | Tatsächliche Azure-HTTP-Versuche nach Ressourcenart; einschließlich Authentifizierungswartezeit, Netzwerk und Antwortkörper, ohne anschließenden Retry-Backoff |
| `response` | Browserseitiger Matrix-Abruf einschließlich Lesen und Parsen der Antwort |

`counts` enthält unter anderem `httpStarted`, `httpCompleted`, `httpStatus200`, `httpStatus429`, `httpMaxInFlight`, `httpCacheHits`, `runsItems`, `resultsItems` und `projectionCount`. Nicht aufgetretene Zähler können fehlen. `httpCompleted` bedeutet auch hier transportseitig abgeschlossene Versuche; HTTP-Fehlerstatus bleiben separat sichtbar.

`httpRetries` zählt erneute Versuche derselben URL nach einer fehlgeschlagenen Antwort oder einem Transportfehler innerhalb dieses Reads. `httpRetryWaitMs` summiert die beobachtete Zeit zwischen Fehler und nächstem Versuch; sie umfasst Backoff und mögliche weitere Wartezeit beim Aufrufer. Nicht beendete Retry-Wartezeiten, etwa bei einem Abbruch, sind darin nicht enthalten. `http-response` nennt vorhandene numerische `retryAfterMs`; `http-retry` nennt die beobachtete Wartezeit. Detailmeldungen sind auf fünf je HTTP-Status, fünf Retries und fünf Operationsfehler pro Read begrenzt; Summenzähler laufen weiter.

Die Diagnose enthält keine Testtitel, Work-Item-Inhalte, URLs, Organisations-/Projektnamen, Set-/Query-IDs, Tokens, Headerinhalte oder unbearbeiteten Fehlermeldungen. Zulässig sind die zufällige Request-UUID, feste Operationsnamen, Zeitwerte, numerische Plan-/Suite-/Run-IDs und Zähler. Die Messungen bleiben flüchtig und werden nicht in Nutzerpräferenzen gespeichert.
