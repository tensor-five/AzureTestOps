# AGENTS.md

## Verbindliche Design-Referenz

- Das visuelle Erscheinungsbild orientiert sich strikt an [`AzureGanttOps`](../AzureGanttOps/). Header, Footer, Farben, Schriftart und Schriftgrößen sind aus `src/app/bootstrap/local-ui-tokens.css` und `local-ui-shell.css` übernommen.
- Alle neuen UI-Klassen müssen in das bestehende Token-System passen (`var(--color-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--font-*)`).

## Verbindliche Persistenz-Referenz

- Nutzerbezogene lokale Einstellungen werden über `lowdb` persistiert (Datei: `~/.azure-testops/user-preferences.json`, API: `/phase2/user-preferences`).
- Referenzimplementierung: `src/adapters/persistence/settings/lowdb-user-preferences.adapter.ts`.
- `localStorage` ist nur Fallback/Kompatibilitätsschicht im UI, nicht die führende Persistenzquelle.

## Was wird in lowdb persistiert

- `themeMode` (system/light/dark)
- aktives Set + Set-Liste
- Layout pro Set (Item-Positionen, eingeklappte Suites, Filter)
- gespeicherte ADO-Kontexte (organization/project)

Keine Datenbank für rein flüchtige Laufzeitdaten (Polling-Zwischenstände, temporäre UI-Flags) — dafür In-Memory-State.

## Clean-Code-Prinzipien (verbindlich)

- Refactor-only bedeutet: kein geändertes Laufzeitverhalten ohne expliziten Feature-Auftrag.
- Kleine, klar benannte Module statt großer Sammeldateien.
- Eine Datei hat eine primäre Verantwortung.
- Logik nicht duplizieren; gemeinsame Logik in Utility/Service/Factory zentralisieren.
- UI-Orchestrierung und Fachlogik trennen: Komponenten koordinieren, Services berechnen.
- Persistenzzugriff kapseln (Store/Adapter), nicht ad hoc in beliebigen Komponenten.
- Jede Änderung braucht passende Tests im betroffenen Bereich (Unit + ggf. Integration).
- Vor Abschluss `typecheck`, betroffene Tests und Cycle-Check ausführen.

## Architektur-Landkarte (Wo finde ich was?)

- `src/features/relations-view/`
  - Zwei-Spalten-View, Suite-Tree, Item-Drag, Linien-Layer.
  - Hauptorchestrator: `relations-pane.tsx` (analog `timeline-pane.tsx` aus AzureGanttOps).
  - State-Hooks: `use-item-positioning.ts`, `use-line-drawing.ts`, `use-suite-collapse.ts`.
- `src/features/set-management/`
  - Set CRUD Dialog + Header-Dropdown.
- `src/features/filters/`
  - Filter-Bar pro Spalte, pure Filter-Funktionen.
- `src/app/bootstrap/`
  - App-Start, HTTP-Server, UI-Client-Composition.
  - `ui-client.tsx` bleibt Kompositionsebene; Workflow-/Berechnungslogik in dedizierte Module.
- `src/shared/user-preferences/`
  - Preferences-Modelle/Sanitizing/Clientzugriff.
- `src/adapters/persistence/settings/`
  - LowDB-Adapter als führende Persistenzimplementierung.
- `src/adapters/azure-devops/test-management/`
  - 5 Adapter für `/test/Plans`, `/test/Plans/{id}/suites`, `/test/Plans/{id}/suites/{id}/points`, `/test/runs`, `/test/Runs/{id}/results` mit retry/backoff.
- `src/adapters/azure-devops/work-items/`
  - Hydration-Adapter (chunked, max 200 IDs) + Relations-PATCH-Adapter.

## Verbindliche Umsetzungsmuster

### 1) RelationsPane und Item-Interaktionen

- `relations-pane.tsx` nur als Orchestrator weiterentwickeln.
- Neue komplexe State-Blöcke zuerst als Hook unter `src/features/relations-view/` anlegen.
- Hook-Namen nach Domäne wählen (`use-item-dragging`, `use-line-drawing`, `use-suite-collapse`).
- Bestehende Props, ARIA-Labels und UX-Flows stabil halten.

### 2) Preferences

- Für neue/angepasste Preferences immer `createUserPreferenceStore<T>` nutzen (analog AzureGanttOps).
- `sanitize` und `buildPatch` sind Pflicht.
- `localStorage` nur als Fallback.

### 3) UI-Client Entkopplung

- `ui-client.tsx` darf koordinieren, aber keine wachsende fachliche Detail-Logik aufnehmen.
- Header-/Set-Workflow, Runtime-Enrichment, Transformationslogik in Services/State-Container.

## Testkonventionen

- Für neue `.spec.ts` mit DOM-Zugriff: `// @vitest-environment jsdom` setzen.
- Jede ausgelagerte Utility/Service-Datei bekommt eigene Unit-Tests.
- Bei Refactors immer relevante `relations-pane` Regressionen mitlaufen lassen.
- Testnamen beschreiben Verhalten, nicht Implementierungsdetails.

## Azure CLI Zugriff (Test Management & Work Items)

Voraussetzung: Nutzer ist lokal via `az login` angemeldet, hat die `azure-devops` Extension installiert, und Defaults sind gesetzt:

```bash
az devops configure --defaults organization=https://dev.azure.com/<org> project=<project>
```

REST-Pfade die wir nutzen (alle als adapter-internes Detail):

- `GET /_apis/test/Plans/{planId}/suites?$asTreeView=true` — Suite-Tree
- `GET /_apis/test/Plans/{planId}/suites/{suiteId}/testcases` — Test Cases einer Suite
- `GET /_apis/test/Plans/{planId}/suites/{suiteId}/points?includePointDetails=true` — Test Points (mit Paging via `x-ms-continuationtoken`)
- `GET /_apis/test/runs?planId={planId}&$top=...&$skip=...` — alle Runs eines Plans
- `GET /_apis/test/Runs/{runId}/results?detailsToInclude=Point` — Results pro Run (Paging via $top/$skip)
- `GET /_apis/wit/workitems?ids=1,2,3` — chunked Hydration (max 200 IDs)
- `PATCH /_apis/wit/workitems/{id}` — Relations setzen/entfernen (`System.LinkTypes.Related`)

Matching beim Aggregieren:
- `TestResult.testCase.id == TestCase.workItemId`
- `TestResult.testSuite.id == TestCase.suiteId`
- pro `(workItemId, suiteId)`: Result mit `max(completedDate)` gewinnt → `lastOutcome`

## Guardrails gegen zukünftiges Chaos

- Keine Datei gleichzeitig für mehrere große Refactoring-Pakete verwenden.
- Keine stillen Strukturbrüche: bei größeren Schnitten Doku im `docs/runbook/` aktualisieren.
- Keine Abkürzungen per Workaround, wenn Paketabhängigkeiten blockieren: stoppen und Blocker dokumentieren.
- Wenn unklar ist, wo neue Logik hingehört: zuerst in kleiner Utility/Hook kapseln, dann integrieren.

## Feature Implementation Checklist (bei jedem Feature verpflichtend)

- Scope und Zielverhalten schriftlich klären.
- Zuständigkeit festlegen: In welches Modul gehört die Logik?
- Bestehende Patterns wiederverwenden — keine parallelen Sonderlösungen.
- Persistenz prüfen: `lowdb` als führende Quelle, `localStorage` Fallback.
- UI/UX-Konformität gegen Tokens prüfen.
- Tests ergänzen: Unit + Regression.
- Qualitätsgates vor Abschluss: `npm run typecheck`, `npm run check:cycles`, `npm test`.
