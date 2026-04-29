# AzureTestOps — Implementation Plan

> **Living document.** Update after every phase: tick off completed work, record the commit hash, and capture any new decisions or follow-ups. Designed so a fresh Claude session can pick up where the previous one left off without re-deriving the architecture or rediscovering Q&A decisions.

## How to use this file

1. **Before starting a phase:** read the goal, acceptance criteria, and checklist for that phase.
2. **While working:** keep checkboxes in sync — tick `[x]` as soon as a deliverable lands.
3. **When the phase is committed:** record the commit hash and the test/cycle counts.
4. **When you discover something new:** add it to "Decisions / Open Questions / Follow-ups" — never lose it to chat history.

---

## 1 · Goal

A local-first tool that maps **Azure DevOps Test Cases** (with full Test Suite hierarchy and outcome aggregation across Test Runs / Test Points / Test Results) against **Bugs / Work Items** (driven by a Saved Query) in a two-column view, with two interaction modes:

- **Edit Relations:** draw a line between Test Case ↔ Bug → writes a `System.LinkTypes.Related` link to Azure DevOps (live).
- **Move Items:** drag items per Set (snap-to-grid, persisted in lowdb).

The tool is structurally and visually a sister project to [`AzureGanttOps`](../AzureGanttOps/) — same Hexagonal architecture, same UI tokens (Satoshi font, primary `#842CC3`, secondary `#87F3A4`, header/footer shell, dark/light theme).

Currently **closed source**; will follow AzureGanttOps and become open source once v1 is stable.

---

## 2 · Locked Decisions (from Q&A)

| # | Topic | Decision |
|---|---|---|
| 1 | Relations persistence | **Live to Azure DevOps** (PATCH on draw / delete; existing related links shown on load) |
| 2 | Item positions | **Per Set in lowdb, with Snap-to-Grid** (20px) |
| 3 | Set definition | `Set = 1 Test Plan + 1 root Test Suite (recursive) + 1 Saved Query` |
| 4 | Right column filter | **All work items from the query** (generic "Work Items" column, no hard `WorkItemType=Bug` filter) |
| 5 | Data loading | **Single load + manual Refresh button with progress** (no auto-poll, no on-disk snapshot cache) |
| 6 | Auth | **Azure CLI (`az login`)** like AzureGanttOps; PAT via env still works as fallback |
| 7 | Delete a relation | **Select a line + press Delete** (live PATCH `op:remove`) |
| 8 | Filter persistence | **Per Set in lowdb** |
| 9 | Set-switcher UI | **Dropdown in the header** (analog to AzureGanttOps' query dropdown) |
| 10 | Filters v1 | **Last Outcome (Test Cases) · Title full-text (both columns) · Standard work-item filters** (State, AssignedTo, Tags, WorkItemType) |
| 11 | Repo / OSS | **Closed source initially** (local `git init`, no remote); structurally OSS-ready (will mirror AzureGanttOps OSS path later) |

---

## 3 · Bounded Contexts

| Context | Inhalt | Where |
|---|---|---|
| **Test Management** | TestPlan, TestSuite (Tree), TestCase, TestPoint, TestRun, TestResult, OutcomeAggregator | `src/domain/test-management/` |
| **Work Items** | WorkItem (generic), Saved Queries | `src/domain/work-items/`, Phase 3 query domain TBD |
| **Relations** | `System.LinkTypes.Related` between WorkItem ids | Phase 3 |
| **Sets** | Set (planId + rootSuiteId + queryId), active selection, layout per set | Phase 4 |

### Central read model: `TestCaseProjection`

One projection per **(workItemId, suiteId)** combination. `lastOutcome` = outcome of the result with the largest `completedDate` matching the same `(workItemId, suiteId)`. Without this aggregation, the "letztes Result = grün ausblenden" filter cannot work correctly.

---

## 4 · Architecture (target)

```text
src/
  app/
    bootstrap/         # HTTP server, UI client, theme, CSS
    composition/       # DI wiring (Phase 5+)
    config/
  domain/
    test-management/   # TestSuiteTree, TestCaseProjection, OutcomeAggregator (pure)
    work-items/        # WorkItem
    relations/         # Phase 3
    sets/              # Phase 4
  application/
    use-cases/         # LoadTestCaseProjections, CreateRelation, DeleteRelation, LoadActiveSetSnapshot, ...
    ports/             # TestManagementReadPort, WorkItemHydrationPort, RelationPort, SetRepositoryPort, ...
    dto/
  adapters/
    azure-devops/
      auth/            # CLI preflight (✅)
      test-management/ # 5 endpoints with retry/backoff (✅)
      work-items/      # hydration + relations PATCH (Phase 3)
      queries/         # saved query listing + execution (Phase 3)
    persistence/
      settings/        # lowdb adapter (✅)
    telemetry/
  features/
    relations-view/    # two columns + line layer (Phase 6/7)
    set-management/    # CRUD dialog (Phase 5)
    filters/           # filter bar per column (Phase 8)
    navigation/
  shared/
    types/
    utils/             # retry, mapConcurrent, azure-cli-path (✅)
    errors/
    security/          # sanitize-html-fragment (✅)
    user-preferences/  # schema + client (✅)
    azure-devops/      # AzureRestHttpClient + buildAdoBaseUrl (✅)
```

### Pflichtprinzipien

- UI knows only application use cases — never raw Azure DTOs.
- Azure-specific details stay inside adapters.
- Domain is Azure-agnostic.
- Reads and writes are isolated (RelationPort write side is its own port).

---

## 5 · Visual & Interaction Spec

- **Look-and-feel = AzureGanttOps.** `local-ui-tokens.css` and `local-ui-base.css` are byte-identical copies. `local-ui-shell.css` is a focused subset.
- **Header (fixed):** `<section class="ui-shell-header">` with `.ui-shell-brand` (h1 `Azure TestOps`) and `.ui-shell-header-actions` (auth-preflight badge, set-dropdown, mode toggle, refresh, theme toggle).
- **Footer (fixed):** `<footer class="ui-shell-footer">` — minimal, transparent, links to TensorFive.
- **Theme:** `data-theme="light|dark"` on `<html>`, persisted via lowdb (source of truth) + localStorage (FOUC fallback).
- **Snap-to-grid:** 20px (matches Gantt density constants).
- **Lines:** SVG overlay (selectable, hoverable). Native pointer events for drag-to-connect — no React Flow, no DnD library.

---

## 6 · Phase Plan

> Status legend: `[ ]` not started · `[/]` in progress · `[x]` done

### Phase 0 — Project Setup & Repo Init `[x]`

- **Goal:** running app skeleton with the AzureGanttOps look, quality gate green.
- **Acceptance:** `npm run quality:gate` runs on a fresh repo.

Deliverables:
- [x] `package.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`
- [x] `.gitignore`, `.gitattributes`, `.nvmrc`, `.env.example`
- [x] `CLAUDE.md`, `AGENTS.md`, `README.md`
- [x] `scripts/check-cycles.mjs`, `secret-scan.mjs`, `one-click-build-cache.mjs`, `one-click-start.mjs`
- [x] `.husky/pre-commit` with lint-staged secret scan
- [x] `Start Azure TestOps.command` + `.cmd`
- [x] CSS tokens, base, shell (header + footer + theme toggle)
- [x] Minimal HTTP server (`/`, `/health`, `/favicon.svg`, `/dist/*`)
- [x] React 19 app shell with theme toggle
- [x] `git init` + first commit
- [x] Quality gate green (3 test files, 16 tests)

**Commit:** `0027647 feat: bootstrap AzureTestOps repo with hexagonal skeleton and shared visual look`

---

### Phase 1 — Foundation 1:1 from AzureGanttOps `[x]`

- **Goal:** auth preflight, lowdb persistence, CSRF, theme persisted to lowdb.
- **Acceptance:** app boots; `/phase2/auth-preflight` returns adapter result; `/phase2/user-preferences` round-trips; UI header shows preflight badge.

Deliverables:
- [x] `application/ports/auth-preflight.port.ts`
- [x] `adapters/azure-devops/auth/azure-cli-preflight.adapter{.ts,.spec.ts}` (1:1 from AzureGanttOps)
- [x] `shared/utils/azure-cli-path.{ts,spec.ts}` (1:1)
- [x] `shared/security/sanitize-html-fragment.{ts,spec.ts}` (1:1)
- [x] `shared/user-preferences/user-preferences.schema.{ts,spec.ts}` (NEW for AzureTestOps; themeMode + sets/setLayouts/setFilters envelope)
- [x] `shared/user-preferences/user-preferences.client.ts`
- [x] `adapters/persistence/settings/lowdb-user-preferences.adapter.{ts,spec.ts}` (`~/.azure-testops/user-preferences.json`)
- [x] `app/bootstrap/http-server.ts` rewritten with CSRF + endpoints
- [x] `app/bootstrap/local-server.ts` resolves Azure CLI path on startup
- [x] `app/bootstrap/ui-client.tsx` with auth-preflight badge and lowdb-backed theme
- [x] `local-ui-shell.css` extended with `.ui-preflight-badge` styles
- [x] Quality gate green (8 test files, 45 tests)
- [x] Live smoketest: CSRF rejection (403) and round-trip (200)

**Commit:** `12649eb feat: foundation layer with Azure CLI auth, CSRF, lowdb prefs and UI banner`

---

### Phase 2 — Test Management Domain & Adapters `[x]`

- **Goal:** the fachliche Kern — Outcome aggregation per `(workItemId, suiteId)`.
- **Acceptance:** OutcomeAggregator covers last-completedDate-wins matrix; adapters page through Azure REST 7.1 reliably.

Deliverables:
- [x] Domain types: `outcome.ts`, `test-suite-tree.ts`, `test-point.ts`, `test-result.ts`, `test-run.ts`, `test-case-projection.ts`, `work-items/work-item.ts`
- [x] `outcome-aggregator.{ts,spec.ts}` — pure function, 7 test cases
- [x] `test-suite-tree.spec.ts` — flatten / find / collect helpers
- [x] `shared/utils/retry.{ts,spec.ts}` — exponential backoff with Retry-After
- [x] `shared/utils/concurrency.{ts,spec.ts}` — bounded parallel mapper
- [x] `shared/azure-devops/azure-rest-client.{ts,spec.ts}` — HttpClient interface + URL builder
- [x] `application/ports/test-management.port.ts`, `work-item-hydration.port.ts`
- [x] `application/use-cases/load-test-case-projections.use-case.{ts,spec.ts}`
- [x] `adapters/azure-devops/test-management/azure-test-management.adapter.{ts,spec.ts}` — 5 endpoints with paging (continuation token + skip/top)
- [x] `adapters/azure-devops/work-items/azure-work-item-hydration.adapter.{ts,spec.ts}` — chunked at 200 ids, parses `System.LinkTypes.Related`
- [x] Quality gate green (16 test files, 83 tests, 28 source files cycle-free)

**Commit:** `07d1240 feat: test management domain, ports, use case and Azure adapters`

---

### Phase 3 — Work Items + Relations `[ ]`

- **Goal:** Saved Query listing/execution + Related-link write API.
- **Acceptance:** `RelationPort.add/remove` writes via PATCH `relations[]` with optimistic concurrency; saved query catalog can be listed and executed end-to-end (returning ids → already-hydrated work items).

Deliverables:
- [ ] `domain/relations/related-link.ts` — domain type for the `(sourceId, targetId)` pair
- [ ] `application/ports/relation.port.ts` — `addRelation` / `removeRelation`
- [ ] `application/ports/saved-query.port.ts` — `listSavedQueries` / `executeQuery`
- [ ] `adapters/azure-devops/work-items/azure-relation.adapter.{ts,spec.ts}` — PATCH with `op:add` / `op:remove` on `relations[index]`; tests cover idempotency and "already exists" edge cases
- [ ] `adapters/azure-devops/queries/azure-saved-query.adapter.{ts,spec.ts}` — list shared queries (depth=2), execute by id (WIQL flat or tree), return `{ ids, relations }`
- [ ] Use cases: `CreateRelation`, `DeleteRelation`, `RunSavedQuery` (composes saved-query + hydration)
- [ ] Quality gate stays green
- [ ] Commit hash: __

---

### Phase 4 — Sets (CRUD + Active Snapshot) `[ ]`

- **Goal:** sets are first-class, switchable, persistent.
- **Acceptance:** `LoadActiveSetSnapshot` returns `{ suiteTree, projections, workItemsFromQuery, relations }` for the active set; CRUD use cases tested.

Deliverables:
- [ ] `domain/sets/set.ts` — Set value object
- [ ] `application/ports/set-repository.port.ts`
- [ ] `adapters/persistence/settings/set-repository.adapter.{ts,spec.ts}` — sets/activeSetId via lowdb
- [ ] Use cases: `ListSets`, `CreateSet`, `UpdateSet`, `DeleteSet`, `SetActive`, `LoadActiveSetSnapshot` (orchestrates Phase 2 + 3)
- [ ] Quality gate stays green
- [ ] Commit hash: __

---

### Phase 5 — UI Foundation (Header / Set Dropdown / Refresh) `[ ]`

- **Goal:** the actual app shell wired to use cases.
- **Acceptance:** header dropdown lets you switch sets; refresh button shows progress (suites loaded / runs loaded / results loaded); manage-sets dialog can create/edit/delete.

Deliverables:
- [ ] TanStack Query setup with `LoadActiveSetSnapshot`
- [ ] Set dropdown in header (matches AzureGanttOps' query dropdown styles)
- [ ] Mode toggle: edit-relations vs. move-items
- [ ] Refresh button with progress indicator
- [ ] Theme toggle stays
- [ ] Set-manager dialog (create / edit / delete)
- [ ] HTTP endpoints wired: `/phase2/sets`, `/phase2/active-set/snapshot`
- [ ] Commit hash: __

---

### Phase 6 — RelationsView (two columns + Move mode) `[ ]`

- **Goal:** rendered view, draggable items, suite tree collapsible.
- **Acceptance:** items render in two columns; suite hierarchy on the left collapses per suite; positions snap to 20px grid and persist per set.

Deliverables:
- [ ] `features/relations-view/relations-pane.tsx` (orchestrator, no business logic)
- [ ] `test-case-column.tsx` — suite tree, indent by depth, collapse toggles
- [ ] `work-item-column.tsx` — flat list from query
- [ ] Hooks: `use-item-positioning.ts`, `use-suite-collapse.ts`, `use-mode-switch.ts`
- [ ] Snap-to-grid via pointer events (analog to `use-schedule-dragging.ts` from AzureGanttOps)
- [ ] Layout state persisted per set in lowdb
- [ ] Commit hash: __

---

### Phase 7 — Line Layer & Edit Mode `[ ]`

- **Goal:** edit relations live in Azure DevOps.
- **Acceptance:** existing `Related` links render as lines on load; drag-from-source → drop-on-target adds a relation (live PATCH); selecting a line + Delete removes it.

Deliverables:
- [ ] SVG overlay component, draws lines between item anchors
- [ ] `use-line-drawing.ts` — drag-to-connect, hover hit-testing on lines
- [ ] Optimistic update with rollback on PATCH failure
- [ ] Line selection state + Delete keybinding
- [ ] Commit hash: __

---

### Phase 8 — Filters per Column `[ ]`

- **Goal:** the filter set from Q&A #10.
- **Acceptance:** filter bar per column; persists per set; pure function applied to projections.

Deliverables:
- [ ] `features/filters/filter-bar.tsx` — per-column filter UI
- [ ] Pure filter function on `TestCaseProjection[]` and `WorkItem[]`
- [ ] Filters: Last Outcome (left), Title (both), State / AssignedTo / Tags / WorkItemType (both)
- [ ] Persistence per set in lowdb
- [ ] Commit hash: __

---

### Phase 9 — Polish & Quality Gate `[ ]`

- **Goal:** ship-ready v1.
- **Acceptance:** light/dark visual review, Playwright E2E covers golden path, coverage ≥ 80%, no cycles, clean commit history.

Deliverables:
- [ ] Light/dark visual sweep on every screen
- [ ] Playwright E2E with mock Azure backend (golden path + delete-line + set-switch)
- [ ] Coverage ≥ 80% on changed lines
- [ ] `npm run quality:gate` includes `test:e2e`
- [ ] Commit hash: __

---

## 7 · Open Questions / Follow-ups

> Add anything that comes up during a phase but is out of scope for it — so it isn't lost.

- [ ] Phase 5+: HEAD support on the static / favicon routes (low priority; browsers don't send HEAD for assets, but proxies might)
- [ ] Phase 9: ADRs for non-trivial decisions (auth flow, relation patch idempotency, set schema migration story)
- [ ] When the set has > 10k results, show a "Refresh dauert lange — Cancel" affordance (Phase 5 refresh UX)

---

## 8 · Repo / Operations

- Local-only git, no remote yet. Closed source.
- Default port `8081` (`PORT` env overrides) so it can run alongside AzureGanttOps on `8080`.
- Local data: `~/.azure-testops/user-preferences.json`.
- Commit style: `feat:` / `fix:` / `refactor:` with `Co-Authored-By: T5.Code <code@tensorfive.com>` trailer. No Claude/AI attribution. No emojis in commits.
