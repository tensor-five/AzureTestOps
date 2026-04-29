# AzureTestOps — Implementation Plan

> **Living document.** Update after every phase: tick off completed work, record the commit hash, and capture any new decisions or follow-ups. Designed so a fresh Claude session can pick up where the previous one left off without re-deriving the architecture or rediscovering Q&A decisions.

## Table of Contents

1. [How to use this file](#1--how-to-use-this-file)
2. [Goal](#2--goal)
3. [Locked Decisions (with rationale)](#3--locked-decisions-with-rationale)
4. [Architecture](#4--architecture)
5. [Domain Type Signatures](#5--domain-type-signatures)
6. [Azure DevOps REST Cheatsheet](#6--azure-devops-rest-cheatsheet)
7. [Cross-Cutting Design Decisions](#7--cross-cutting-design-decisions)
8. [lowdb Schema & Migration](#8--lowdb-schema--migration)
9. [Test Patterns](#9--test-patterns)
10. [Visual & Interaction Spec](#10--visual--interaction-spec)
11. [Phase Plan](#11--phase-plan)
12. [ADRs to Write](#12--adrs-to-write)
13. [Risk Register](#13--risk-register)
14. [Open Questions & Follow-ups](#14--open-questions--follow-ups)
15. [Repo / Operations](#15--repo--operations)

---

## 1 · How to use this file

1. **Before starting a phase:** read the phase goal, acceptance criteria, deliverable checklist, and the cross-cutting decisions that apply.
2. **While working:** keep checkboxes in sync — tick `[x]` as soon as a deliverable lands. Add new follow-ups under §14 instead of letting them slip into chat history.
3. **When the phase is committed:** record the commit hash and update the test/cycle counters under §11.
4. **When you discover something new:** decide whether it belongs in §3 (locked decision), §7 (cross-cutting design), §13 (risk), or §14 (follow-up). Never lose it to chat history.
5. **When you change a locked decision:** add a one-line note under §3 with date and reason, don't silently overwrite.

---

## 2 · Goal

A local-first tool that maps **Azure DevOps Test Cases** (with full Test Suite hierarchy and outcome aggregation across Test Runs / Test Points / Test Results) against **Bugs / Work Items** (driven by a Saved Query) in a two-column view, with two interaction modes:

- **Edit Relations:** draw a line between Test Case ↔ Bug → writes a `System.LinkTypes.Related` link to Azure DevOps (live PATCH).
- **Move Items:** drag items per Set (snap-to-grid 20 px, persisted in lowdb).

The tool is structurally and visually a sister project to [`AzureGanttOps`](../AzureGanttOps/) — same Hexagonal architecture, same UI tokens (Satoshi font, primary `#842CC3`, secondary `#87F3A4`, header/footer shell, dark/light theme).

Currently **closed source**; will follow AzureGanttOps and become open source once v1 is stable.

---

## 3 · Locked Decisions (with rationale)

| # | Topic | Decision | Why |
|---|---|---|---|
| 1 | Relations persistence | **Live to Azure DevOps** (PATCH on draw / delete; existing related links shown on load) | Save-button mode adds pending-state UX complexity; tool is local & single-user, so optimistic-update + retry is enough. |
| 2 | Item positions | **Per Set in lowdb, with Snap-to-Grid 20 px** | Pro-Set keeps layouts independent (different sets = different stories). 20 px matches AzureGanttOps' Gantt density. |
| 3 | Set definition | `Set = 1 Test Plan + 1 root Test Suite (recursive) + 1 Saved Query` | Mirrors how testers think of "this release" / "this sprint". Recursive suite covers sub-suite hierarchy in one switch. |
| 4 | Right column scope | **All work items from the query** (generic "Work Items" column, no hard `WorkItemType=Bug` filter) | Tool stays useful for non-bug coverage reviews (User Stories, Tasks). Filter by type stays available in §11/Phase 8. |
| 5 | Data loading | **Single load + manual Refresh button with progress** | Avoids ratelimit storms, keeps stale-vs-fresh predictable; long Refresh is acceptable because user triggered it. |
| 6 | Auth | **Azure CLI (`az login`)** | Reuses existing local auth, no token handling in the tool. PAT via env vars (`ADO_PAT`/`AZURE_DEVOPS_EXT_PAT`) is the documented fallback. |
| 7 | Delete a relation | **Select line + Delete key** | Diagram-tool ergonomics; confirmation lives elsewhere (undo via `Ctrl+Z` is a Phase 9 stretch). |
| 8 | Filter persistence | **Per Set in lowdb** | Each set tells a different story; filter state belongs to the story. |
| 9 | Set-switcher UI | **Dropdown in the header** | Same pattern as AzureGanttOps' query dropdown, scales to many sets. |
| 10 | Filters v1 | **Last Outcome (Test Cases) · Title full-text (both) · Standard work-item filters (State, AssignedTo, Tags, WorkItemType)** | Covers 95% of triage workflows; "Has/Has-no relation" deferred to v1.x. |
| 11 | Repo / OSS | **Closed source initially** (private `tensor-five/AzureTestOps` on GitHub since 2026-04-29); structurally OSS-ready | Allows fast iteration; OSS path mirrors AzureGanttOps once v1 ships — flip visibility to public, no migration needed. |

---

## 4 · Architecture

### 4.1 Pillars (non-negotiable, repeated from `CLAUDE.md`)

Hexagonal Architecture (Ports & Adapters) · Clean Architecture · SOLID · Tactical DDD · Twelve-Factor mindset · C4 documentation mindset · ISO/IEC 25010 maintainability · Sonar A · Coverage ≥ 80 % · No cyclic dependencies.

### 4.2 Bounded Contexts

| Context | Where | Inhalt |
|---|---|---|
| **Test Management** | `src/domain/test-management/` | TestPlan, TestSuiteTree, TestCase, TestPoint, TestRun, TestResult, OutcomeAggregator |
| **Work Items** | `src/domain/work-items/` | WorkItem (id, type, title, state, assignedTo, tags, areaPath, priority, relatedIds) |
| **Saved Queries** | `src/domain/queries/` (Phase 3) | SavedQuery (id, name, path), QueryExecutionResult (ids, relations) |
| **Relations** | `src/domain/relations/` (Phase 3) | RelatedLink (sourceId, targetId, rel = `System.LinkTypes.Related`) |
| **Sets** | `src/domain/sets/` (Phase 4) | Set, SetCollection, ActiveSetSnapshot |

### 4.3 Central read model

`TestCaseProjection` — one row per `(workItemId, suiteId)` combination. `lastOutcome` = outcome of the result with the largest `completedDate` matching the same `(workItemId, suiteId)`. **Without this aggregation the "letztes Result = grün ausblenden" filter cannot work correctly** — it is the load-bearing piece of the whole domain.

### 4.4 Target tree

```text
src/
  app/
    bootstrap/         # HTTP server, UI client, theme, CSS
    composition/       # DI wiring (Phase 5+)
    config/
  domain/
    test-management/   # TestSuiteTree, TestCaseProjection, OutcomeAggregator (pure)
    work-items/        # WorkItem
    queries/           # Phase 3 (saved query value objects)
    relations/         # Phase 3 (related link value object)
    sets/              # Phase 4 (Set, ActiveSetSnapshot)
  application/
    use-cases/         # LoadTestCaseProjections, RunSavedQuery, CreateRelation, DeleteRelation,
                       # LoadActiveSetSnapshot, ListSets, CreateSet, UpdateSet, DeleteSet, SetActive
    ports/             # TestManagementReadPort, WorkItemHydrationPort, RelationPort,
                       # SavedQueryPort, SetRepositoryPort, AdoContextPort, AuthPreflightPort
    dto/
  adapters/
    azure-devops/
      auth/            # CLI preflight (✅ Phase 1)
      test-management/ # 5 endpoints with retry/backoff (✅ Phase 2)
      work-items/      # hydration (✅ Phase 2) + relation patch (Phase 3)
      queries/         # saved query catalog + WIQL execution (Phase 3)
    persistence/
      settings/        # lowdb adapter (✅ Phase 1)
    telemetry/
  features/
    relations-view/    # two columns + line layer (Phase 6/7)
    set-management/    # CRUD dialog (Phase 5)
    filters/           # filter bar per column (Phase 8)
    navigation/
  shared/
    azure-devops/      # AzureRestHttpClient + buildAdoBaseUrl (✅)
    security/          # sanitize-html-fragment (✅)
    user-preferences/  # schema + client (✅)
    utils/             # retry, mapConcurrent, azure-cli-path (✅)
    types/
    errors/
```

### 4.5 Cross-layer rules

- UI knows only application use cases — never raw Azure DTOs or HTTP.
- Azure-specific shapes (DTOs, URLs, JSON Patch) stay inside adapters.
- Domain is Azure-agnostic and pure (no I/O, no `Date.now()` calls outside builders, no env vars).
- Read- and write-side ports are separate (Reads: `TestManagementReadPort` etc. Writes: `RelationPort`, `SetRepositoryPort`).

---

## 5 · Domain Type Signatures

The exact shapes that survive contract drift between phases. Update here before changing the type, not after.

```ts
// src/domain/test-management/outcome.ts
type KnownOutcome =
  | "Passed" | "Failed" | "NotRun" | "Blocked" | "NotApplicable"
  | "Paused" | "Inconclusive" | "InProgress" | "Warning" | "Error"
  | "Aborted" | "Timeout" | "Unspecified";
type Outcome = KnownOutcome | (string & {});
const NOT_RUN: Outcome = "NotRun";
```

```ts
// src/domain/test-management/test-suite-tree.ts
type TestSuiteNode = {
  id: number;
  name: string;
  parentSuiteId: number | null;
  path: string;            // "Root > API > Auth"
  children: TestSuiteNode[];
};
type TestSuiteFlatEntry = {
  id: number; name: string; parentSuiteId: number | null; path: string; depth: number;
};
```

```ts
// src/domain/test-management/test-point.ts
type TestPoint = {
  pointId: number;
  workItemId: number;          // = testCase.id
  suiteId: number;
  configurationId: number | null;
  configurationName: string | null;
  lastRunId: number | null;
  lastResultId: number | null;
};
```

```ts
// src/domain/test-management/test-result.ts
type TestResult = {
  resultId: number;
  runId: number;
  testCaseReferenceId: number; // = testCase.id (work item id)
  suiteId: number | null;
  pointId: number | null;
  outcome: Outcome;
  completedDate: string | null; // ISO; nullable means "ignore for aggregation"
};
```

```ts
// src/domain/test-management/test-run.ts
type TestRun = {
  runId: number;
  planId: number;
  name: string;
  state: string;
  startedDate: string | null;
  completedDate: string | null;
  totalTests: number;
  passedTests: number;
  isAutomated: boolean;
};
```

```ts
// src/domain/work-items/work-item.ts
type WorkItem = {
  id: number;
  workItemType: string;        // "Test Case", "Bug", "User Story", ...
  title: string;
  state: string;
  assignedTo: string | null;
  tags: string[];
  areaPath: string | null;
  priority: number | null;
  relatedIds: number[];        // System.LinkTypes.Related target ids
};
```

```ts
// src/domain/test-management/test-case-projection.ts
type TestCaseProjection = {
  workItemId: number;
  suiteId: number;
  suitePath: string;
  // From WorkItem:
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string | null;
  tags: string[];
  areaPath: string | null;
  priority: number | null;
  relatedIds: number[];
  // From latest TestPoint per (workItemId, suiteId):
  testPointId: number | null;
  configurationId: number | null;
  configurationName: string | null;
  // From latest matching TestResult:
  lastOutcome: Outcome;        // NOT_RUN if no result matched
  lastResultId: number | null;
  lastResultCompletedDate: string | null;
  lastRunId: number | null;
};
type TestCaseProjectionKey = `${number}::${number}`;  // workItemId::suiteId
```

```ts
// Phase 3 — sketch
// src/domain/relations/related-link.ts
type RelatedLink = { sourceWorkItemId: number; targetWorkItemId: number };

// src/domain/queries/saved-query.ts
type SavedQuery = { id: string; name: string; path: string; isFolder: boolean };
type QueryExecutionResult = { workItemIds: number[]; relations: unknown[] };
```

```ts
// Phase 4 — sketch
// src/domain/sets/set.ts
type Set = {
  id: string;
  name: string;
  planId: number;
  planName?: string;
  rootSuiteId: number;
  rootSuiteName?: string;
  queryId: string;
  queryName?: string;
  organization?: string;       // optional override; default from ADO context
  project?: string;
};
type ActiveSetSnapshot = {
  set: Set;
  suiteTree: TestSuiteNode;
  projections: TestCaseProjection[];
  workItemsFromQuery: WorkItem[];
  // relations come from each item's `relatedIds`; no separate field needed
  loadedAt: string;            // ISO
};
```

### 5.1 OutcomeAggregator rules (canonical)

The pure function `aggregateTestCaseProjections(input)` follows these rules **in this order** — encoded in `src/domain/test-management/outcome-aggregator.ts` and verified by `outcome-aggregator.spec.ts`:

1. Build a `(workItemId, suiteId) → latestResult` index from `input.results`:
   - **Skip** results whose `completedDate` is `null` — they cannot be ordered.
   - **Skip** results whose `suiteId` is `null` — they cannot be matched into a key.
   - For the same key, the result with the **lexicographically largest ISO `completedDate`** wins. (Lexicographic comparison is correct on full ISO 8601 with `Z` suffix.)
2. For every flattened `suiteEntry` × every workItemId in `testCasesBySuiteId.get(suiteEntry.id)`:
   - **Drop** the row if `workItemsById.get(workItemId)` is missing (hydration failure).
   - Take the **first** point per workItemId from `pointsBySuiteId.get(suiteEntry.id)` (multi-config = collapsed).
   - Merge work-item fields, point fields, latest-result fields into a `TestCaseProjection`.
3. **`lastOutcome`** is the latest result's outcome, or `NOT_RUN` if no result matched.
4. **`lastRunId`** falls back to `point.lastRunId` when there is no matching result yet.

---

## 6 · Azure DevOps REST Cheatsheet

All paths are anchored at `https://dev.azure.com/{org}/{project}` (built via `buildAdoBaseUrl`). Auth is `Authorization: Bearer <azure-cli-token>` (Phase 1 default) or `Basic <PAT base64>` (env override).

### 6.1 Reads (used by Phase 2 / 3)

| # | Endpoint | Purpose | Paging | Notes |
|---|---|---|---|---|
| R1 | `GET /_apis/test/Plans/{planId}/suites?$asTreeView=true&api-version=5.0` | Full suite tree for plan | none | Returns `value: [Suite]` with nested `children`. We extract subtree by `rootSuiteId`. API version stays at 5.0 — newer versions changed shape. |
| R2 | `GET /_apis/test/Plans/{planId}/suites/{suiteId}/testcases?api-version=5.0` | Test cases in a suite | none | Each entry has `testCase.id` (= work item id). |
| R3 | `GET /_apis/test/Plans/{planId}/suites/{suiteId}/points?includePointDetails=true&$top=200&api-version=7.1` | Test points in a suite | **`x-ms-continuationtoken` header** → next request adds `&continuationToken=...` | Use `decodeURIComponent` on the next URL build is unnecessary if we passed it through `encodeURIComponent` ourselves. |
| R4 | `GET /_apis/test/runs?planId={planId}&$top=1000&$skip=0&api-version=7.1` | All runs of a plan | **`$skip`/`$top`**; stop when `value.length < $top` | Default page 1000 is API max. |
| R5 | `GET /_apis/test/Runs/{runId}/results?$top=100&$skip=0&detailsToInclude=Point&api-version=7.1` | All results of a run | **`$skip`/`$top`**; stop when `value.length < $top` | `detailsToInclude=Point` caps `$top` at 100. |
| R6 | `GET /_apis/wit/workitems?ids=1,2,3&$expand=relations&api-version=7.1` | Hydrate work items | chunk at **200 ids/request**, parallel via `mapConcurrent` | `relations[].rel === "System.LinkTypes.Related"` carries the related ids; URL pattern `.../_apis/wit/workItems/{id}` parsed via regex `/\/workItems\/(\d+)(?:[?#].*)?$/i`. |
| R7 | `GET /_apis/wit/queries/Shared%20Queries?$depth=2&$expand=all&api-version=7.1` | Saved query catalog | none for depth=2; deeper = client-side recursion | Returns a folder tree; flatten to leaves where `isFolder=false`. |
| R8 | `GET /_apis/wit/wiql/{queryId}?api-version=7.1` | Execute saved query by id | none | Returns `{ workItems: [{id}], workItemRelations? }`. Tree queries return relations; flat queries return only `workItems`. (POST `/_apis/wit/wiql` exists for ad-hoc WIQL bodies; we don't use it.) |
| R9 | `GET /_apis/wit/workitems/{id}?$expand=relations&api-version=7.1` | Read single work item with rev + relations | none | Required before a relation `op:remove` to find the relation index. |

### 6.2 Writes (Phase 3)

| # | Endpoint | Purpose | Body |
|---|---|---|---|
| W1 | `PATCH /_apis/wit/workitems/{id}?api-version=7.1` | Add a Related link | see W1.body below |
| W2 | `PATCH /_apis/wit/workitems/{id}?api-version=7.1` | Remove a Related link by index | see W2.body below |

```jsonc
// W1.body — add System.LinkTypes.Related
// content-type: application/json-patch+json
[
  { "op": "test", "path": "/rev", "value": <currentRev> },
  { "op": "add",  "path": "/relations/-", "value": {
      "rel": "System.LinkTypes.Related",
      "url": "https://dev.azure.com/{org}/_apis/wit/workItems/{targetId}",
      "attributes": { "comment": "" }
  }}
]
// 200 → updated WorkItem
// 409 → rev mismatch → re-fetch (R9), retry once
// 400 with "RelationAlreadyExists" → idempotent, treat as success
```

```jsonc
// W2.body — remove relation at server index
// content-type: application/json-patch+json
[
  { "op": "test", "path": "/rev", "value": <currentRev> },
  { "op": "remove", "path": "/relations/{indexOnServer}" }
]
// Best practice: GET (R9) first to find the index of the (rel, url) pair to remove.
```

### 6.3 Transient errors (handled by `requestWithRetry`)

- HTTP `408`, `429`, `502`, `503`, `504` — exponential backoff, max 4 attempts, honors `Retry-After`.
- Transport errors matching `/(econn|etimedout|network|fetch|timeout|socket)/i` — same retry budget.
- Anything else throws immediately.

---

## 7 · Cross-Cutting Design Decisions

### 7.1 ADO context (organization / project)

Lives in **`~/.azure-testops/ado-context.json`** as `{ organization, project }`. Reasons:

- A single user typically works against one org/project; per-Set override would be noisy.
- Sets stay copy-paste-portable (you can share a set definition without leaking org names).

Phase 1 reads it from env (`ADO_ORGANIZATION`, `ADO_PROJECT`) for preflight only. Phase 5 introduces:
- `GET /phase2/ado-context` → `{ organization, project }`
- `POST /phase2/ado-context` (CSRF-protected) — settings dialog input

`Set.organization` / `Set.project` are optional overrides (rare).

### 7.2 Refresh progress streaming

**Server-Sent Events** on `GET /phase2/active-set/snapshot/stream?setId={id}`. Why SSE over WebSockets:

- One-way (server → client) — matches our use case.
- Plain HTTP — works through any proxy, no upgrade dance.
- Native `EventSource` in the browser — no extra library.

Event shape:
```jsonc
event: progress
data: { "stage": "suites" | "cases" | "points" | "runs" | "results" | "hydrate" | "query",
        "done": <number>, "total": <number> }

event: result
data: { "snapshot": ActiveSetSnapshot }   // sent once at the end

event: error
data: { "code": "...", "message": "..." }
```

Client lives in `features/relations-view/use-active-set-snapshot.ts` (TanStack Query is used for caching the resolved snapshot, but the SSE stream drives progress updates).

### 7.3 Mode state (edit-relations vs move-items)

**React state in the `RelationsView` orchestrator.** Not persisted. Default `"move-items"`. Reason: changing modes is a transient interaction — survival across sessions adds confusion ("why does it open in edit mode?").

### 7.4 CSS naming convention

`kebab-case` BEM-flavored, scoped by feature:
- `.ui-shell-*` for the chrome (header, footer, content)
- `.ui-preflight-badge*`
- `.relations-view`, `.relations-view-column`, `.relations-view-line`, `.relations-view-line-selected`
- `.set-dropdown`, `.set-dropdown-trigger`, `.set-dropdown-panel`
- `.filter-bar`, `.filter-bar-pill`

Utility classes: only the ones AzureGanttOps already has (`.u-btn`, `.u-btn-primary`, `.u-badge`, `.u-surface-card`). No Tailwind, no atomic CSS.

### 7.5 CSRF token rotation

Generated per server start. Embedded in HTML as `<meta name="ado-csrf-token">`. Rotates on every restart — long-lived browser sessions get a 403 on next POST and must reload. Acceptable for v1 (local-only). Revisit if multi-window state becomes common.

### 7.6 Optimistic concurrency on relation PATCH

Always include `{ "op": "test", "path": "/rev", "value": <rev> }` as the first patch operation. On `409 RevisionMismatch` re-fetch via R9 and retry **once**. After that, surface the conflict to the UI as a toast.

### 7.7 Suite-tree depth limit

Azure plans rarely exceed depth 6. We don't enforce a depth cap, but `mapConcurrent(8)` keeps fan-out predictable even on deep trees with hundreds of suites.

---

## 8 · lowdb Schema & Migration

### 8.1 Current shape (v1)

`~/.azure-testops/user-preferences.json`:
```jsonc
{
  "version": 1,
  "users": {
    "<localUserId>": {
      "themeMode": "system" | "light" | "dark",
      "sets": [Set],                          // Phase 4 fills this
      "activeSetId": "<setId>",               // Phase 4
      "setLayouts": {                         // Phase 6
        "<setId>": {
          "positions": { "<workItemId>": { "x": 0, "y": 0 } },
          "collapsedSuites": ["<suiteId>", ...]
        }
      },
      "setFilters": {                         // Phase 8
        "<setId>": { /* opaque filter shape, sanitized */ }
      },
      "updatedAt": "<ISO>"
    }
  }
}
```

`localUserId` is `process.env.USER` / `process.env.USERNAME` / `os.userInfo().username`, falling back to `"local-user"`.

### 8.2 ADO context (separate file)

`~/.azure-testops/ado-context.json`:
```jsonc
{ "version": 1, "organization": "<org>", "project": "<project>" }
```

### 8.3 Migration policy

- Always include `version` at the top.
- New optional fields are added without bumping the version (sanitizer is tolerant).
- **Required** field shape changes bump the version. Migration runs on read in `LowdbUserPreferencesAdapter.getDb()`:
  1. Detect `version`.
  2. If older, run upgraders sequentially (`v1 → v2`, `v2 → v3`, …).
  3. Persist the new shape before returning.
- The sanitizer must accept both the source and target shape during a migration window (one minor release).
- Never delete fields silently — write a migrator that drops them with a comment.

---

## 9 · Test Patterns

These patterns recur. Copy them rather than re-deriving.

### 9.1 Stub `AzureRestHttpClient`

```ts
import type {
  AzureHttpResponse,
  AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";

function makeStubClient(handler: (url: string) => AzureHttpResponse): {
  client: AzureRestHttpClient;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    client: {
      get: async (url) => {
        calls.push(url);
        return handler(url);
      }
    }
  };
}

const ok = (json: unknown, headers: Record<string, string | undefined> = {}): AzureHttpResponse => ({
  status: 200,
  json,
  headers
});
```

Use `calls` array to assert URL shape, query params, and pagination order.

### 9.2 lowdb tempdir

```ts
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;
let filePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "azure-testops-<scope>-"));
  filePath = path.join(tempDir, "user-preferences.json");
});
afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});
```

### 9.3 jsdom for DOM-touching specs

```ts
// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
```

### 9.4 Stub `CliCommandRunner` for preflight tests

```ts
function makeStubRunner(routes: Record<string, () => RunnerResult>): CliCommandRunner {
  return {
    run: async (command) => {
      const handler = routes[command];
      if (!handler) {
        return { stdout: "", stderr: `unexpected: ${command}`, exitCode: 1 };
      }
      return handler();
    }
  };
}
const ok  = (stdout: string)             => ({ stdout, stderr: "", exitCode: 0 });
const err = (stderr: string, code = 1)   => ({ stdout: "", stderr, exitCode: code });
```

### 9.5 `requestWithRetry` in adapter tests

Always pass `{ sleep: async () => undefined }` so retry tests don't actually wait. Already done internally by adapters via the default path; tests of the retry helper itself stub explicitly.

### 9.6 Spec naming

Spec files sit next to the unit under test (`foo.ts` ⇒ `foo.spec.ts`). Describe blocks describe the unit by name. Test names describe behavior, not implementation.

---

## 10 · Visual & Interaction Spec

- **Look-and-feel = AzureGanttOps.** `local-ui-tokens.css` and `local-ui-base.css` are byte-identical copies. `local-ui-shell.css` is a focused subset.
- **Header (fixed top):** `<section class="ui-shell-header">` with `.ui-shell-brand` (h1 `Azure TestOps`) and `.ui-shell-header-actions` (auth-preflight badge, set-dropdown, mode toggle, refresh, theme toggle).
- **Footer (fixed bottom):** `<footer class="ui-shell-footer">` — minimal, transparent, links to TensorFive.
- **Theme:** `data-theme="light|dark"` on `<html>`, persisted via lowdb (source of truth) + localStorage (FOUC fallback during inline-script bootstrap).
- **Snap-to-grid:** 20 px on item top-left only (heights vary).
- **Lines:** SVG overlay (selectable, hoverable). Native pointer events for drag-to-connect — **no React Flow**, **no DnD library**.
- **Anchors:** each item exposes an `[data-relations-anchor]` attribute (left or right edge midpoint). The line layer reads anchor positions on each render.
- **Selection state:** single line at a time. `Esc` deselects, `Delete`/`Backspace` deletes (with optimistic rollback on PATCH error).

---

## 11 · Phase Plan

> Status legend: `[ ]` not started · `[/]` in progress · `[x]` done · _(commit)_

### Phase 0 — Project Setup & Repo Init `[x]` _(0027647)_

**Goal:** running app skeleton with the AzureGanttOps look, quality gate green.
**Acceptance:** `npm run quality:gate` runs on a fresh repo.

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

---

### Phase 1 — Foundation 1:1 from AzureGanttOps `[x]` _(12649eb)_

**Goal:** auth preflight, lowdb persistence, CSRF, theme persisted to lowdb.
**Acceptance:** app boots; `/phase2/auth-preflight` returns adapter result; `/phase2/user-preferences` round-trips; UI header shows preflight badge.

- [x] `application/ports/auth-preflight.port.ts`
- [x] `adapters/azure-devops/auth/azure-cli-preflight.adapter.{ts,spec.ts}` (1:1 from AzureGanttOps)
- [x] `shared/utils/azure-cli-path.{ts,spec.ts}` (1:1)
- [x] `shared/security/sanitize-html-fragment.{ts,spec.ts}` (1:1)
- [x] `shared/user-preferences/user-preferences.schema.{ts,spec.ts}` (NEW; themeMode + sets/setLayouts/setFilters envelope)
- [x] `shared/user-preferences/user-preferences.client.ts`
- [x] `adapters/persistence/settings/lowdb-user-preferences.adapter.{ts,spec.ts}` (`~/.azure-testops/user-preferences.json`)
- [x] `app/bootstrap/http-server.ts` rewritten with CSRF + endpoints
- [x] `app/bootstrap/local-server.ts` resolves Azure CLI path on startup
- [x] `app/bootstrap/ui-client.tsx` with auth-preflight badge and lowdb-backed theme
- [x] `local-ui-shell.css` extended with `.ui-preflight-badge` styles
- [x] Quality gate green (8 test files, 45 tests)
- [x] Live smoketest: CSRF rejection (403) and round-trip (200)

---

### Phase 2 — Test Management Domain & Adapters `[x]` _(07d1240)_

**Goal:** the fachliche Kern — Outcome aggregation per `(workItemId, suiteId)`.
**Acceptance:** OutcomeAggregator covers last-completedDate-wins matrix; adapters page through Azure REST 7.1 reliably.

- [x] Domain types: `outcome.ts`, `test-suite-tree.ts`, `test-point.ts`, `test-result.ts`, `test-run.ts`, `test-case-projection.ts`, `work-items/work-item.ts`
- [x] `outcome-aggregator.{ts,spec.ts}` — pure function, 7 test cases (see §5.1)
- [x] `test-suite-tree.spec.ts` — flatten / find / collect helpers
- [x] `shared/utils/retry.{ts,spec.ts}` — exponential backoff with Retry-After
- [x] `shared/utils/concurrency.{ts,spec.ts}` — bounded parallel mapper
- [x] `shared/azure-devops/azure-rest-client.{ts,spec.ts}` — HttpClient interface + URL builder
- [x] `application/ports/test-management.port.ts`, `work-item-hydration.port.ts`
- [x] `application/use-cases/load-test-case-projections.use-case.{ts,spec.ts}`
- [x] `adapters/azure-devops/test-management/azure-test-management.adapter.{ts,spec.ts}` — 5 endpoints with paging (continuation token + skip/top)
- [x] `adapters/azure-devops/work-items/azure-work-item-hydration.adapter.{ts,spec.ts}` — chunked at 200 ids, parses `System.LinkTypes.Related`
- [x] Quality gate green (16 test files, 83 tests, 28 source files cycle-free)

---

### Phase 3 — Saved Queries + Relations `[x]` _(f445211)_

**Goal:** Saved Query listing + execution + Related-link write API.
**Acceptance:** can list shared queries, execute one by id, get back hydrated work items; `RelationPort.add/remove` writes via PATCH `relations[]` with optimistic concurrency (rev test) and idempotent "already exists" handling.

Files to create:
- [x] `domain/queries/saved-query.ts` — `SavedQuery`, `QueryExecutionResult` types
- [x] `domain/relations/related-link.ts` — `RelatedLink` type
- [x] `application/ports/saved-query.port.ts`
- [x] `application/ports/relation.port.ts`
- [x] `application/use-cases/run-saved-query.use-case.{ts,spec.ts}` — composes `SavedQueryPort` + `WorkItemHydrationPort`
- [x] `application/use-cases/create-relation.use-case.{ts,spec.ts}`
- [x] `application/use-cases/delete-relation.use-case.{ts,spec.ts}`
- [x] `adapters/azure-devops/queries/azure-saved-query.adapter.{ts,spec.ts}` — implements `SavedQueryPort`
  - `listSavedQueries()` — flattens R7 (`/wit/queries/Shared%20Queries?$depth=2`) into leaf queries (`isFolder=false`)
  - `executeQuery(queryId)` — GET R8 → `{ workItemIds, relations }` (the documented stored-query endpoint; plan.md previously said POST — corrected as part of this phase)
- [x] `adapters/azure-devops/work-items/azure-relation.adapter.{ts,spec.ts}` — implements `RelationPort`
  - `addRelation(sourceId, targetId)` — GET R9 to read rev → PATCH W1 → on `409` re-fetch + retry once
  - `removeRelation(sourceId, targetId)` — GET R9 → find index of matching `(rel, url)` → PATCH W2 → on `409` re-fetch + retry once
  - on `400 RelationAlreadyExists` (add) treat as success
  - on `404` / no matching relation (remove) treat as success (idempotent)

Tests:
- [x] saved-query adapter: stub HttpClient; assert URL + flattening of nested folders + extraction of `id`/`name`/`path`
- [x] relation adapter: optimistic concurrency happy path, 409→retry→success, 400 idempotent, missing relation on remove → no-op
- [x] use cases: stub the ports; assert orchestration

Server / Wiring:
- [ ] (deferred to Phase 5) HTTP endpoints `/phase2/saved-queries`, `/phase2/relations` (POST/DELETE)

Acceptance check:
- [x] Quality gate green (21 test files, 116 tests, 37 source files cycle-free)
- [x] Commit hash: `f445211`

---

### Phase 4 — Sets (CRUD + Active Snapshot) `[x]` _(a90c734)_

**Goal:** sets are first-class, switchable, persistent.
**Acceptance:** `LoadActiveSetSnapshot` returns `ActiveSetSnapshot` (suiteTree + projections + workItemsFromQuery + relations) for the active set; CRUD use cases tested end-to-end against lowdb tempdir.

Files:
- [x] `domain/sets/set.ts` — `Set` value object + `SetDraft` + `ActiveSetSnapshot`
- [x] `application/ports/set-repository.port.ts` — `listSets`, `getById`, `create`, `update`, `delete`, `getActiveId`, `setActiveId`
- [x] `application/ports/ado-context.port.ts` — `getContext()`, `setContext({org, project})`
- [x] `adapters/persistence/settings/set-repository.adapter.{ts,spec.ts}` — wraps `LowdbUserPreferencesAdapter` via new atomic `updatePreferences(updater)`; sets/activeSetId/setLayouts/setFilters live in `users[localUserId]`
- [x] `adapters/persistence/settings/file-ado-context.adapter.{ts,spec.ts}` — reads/writes `~/.azure-testops/ado-context.json` (versioned)
- [x] `application/use-cases/list-sets.use-case.{ts,spec.ts}`
- [x] `application/use-cases/create-set.use-case.{ts,spec.ts}` — validates planId/rootSuiteId/queryId, optional `setActive` promotion
- [x] `application/use-cases/update-set.use-case.{ts,spec.ts}` — required-field validation when present
- [x] `application/use-cases/delete-set.use-case.{ts,spec.ts}` — repo cascades `setLayouts[id]` / `setFilters[id]` and clears active pointer
- [x] `application/use-cases/set-active-set.use-case.{ts,spec.ts}` — accepts `null` to clear
- [x] `application/use-cases/load-active-set-snapshot.use-case.{ts,spec.ts}` — orchestrates Phase 2 (`loadTestCaseProjections`) + Phase 3 (`runSavedQuery`); typed errors `AdoContextMissingError` / `NoActiveSetError` / `SetNotFoundError` / `InvalidSetIdentifierError`

Side-effects landed in this phase:
- [x] Renamed schema field `SetPreference.suiteId` → `rootSuiteId` (and `suiteName` → `rootSuiteName`) for vocabulary alignment with §5.
- [x] Fixed a shared-reference bug in `LowdbUserPreferencesAdapter` where `DEFAULT_DB` (passed to `JSONFilePreset`) was mutated across instances under vitest's in-memory adapter (`NODE_ENV === "test"`). Replaced with `defaultDb()` factory.

Acceptance check:
- [x] Quality gate green (29 test files, 154 tests, 48 source files cycle-free)
- [x] Commit hash: `a90c734`

---

### Phase 5 — UI Foundation (Header, Set Dropdown, Refresh) `[x]` _(beeb147)_

**Goal:** the actual app shell wired to use cases.
**Acceptance:** header dropdown lets you switch sets; refresh button shows progress (per stage); manage-sets dialog can create/edit/delete; mode toggle works.

UI:
- [x] `app/bootstrap/ui-client.tsx` becomes orchestrator only; logic moves to feature modules
- [x] `features/navigation/header.tsx` — composes set-dropdown, mode-toggle, refresh, theme, preflight
- [x] `features/set-management/set-dropdown.tsx` (matches `.header-query-dropdown*` styles from AzureGanttOps)
- [x] `features/set-management/set-manager-dialog.tsx` — CRUD form (plan picker, suite picker, query picker; bootstraps ADO context on first run)
- [x] `features/set-management/use-set-management.ts` — local React state hook over the API client (TanStack Query deferred to Phase 6/7 when mutations need optimistic rollback)
- [x] `features/relations-view/use-active-set-snapshot.ts` — opens SSE stream, exposes `{snapshot, progress, isLoading, error}`
- [x] `features/relations-view/refresh-progress-bar.tsx`
- [x] `features/relations-view/relations-view-placeholder.tsx` — Phase 5 stand-in for the two-column view (Phase 6 replaces it)
- [x] `features/relations-view/mode.ts` (mode-toggle helpers per §7.3)
- [x] `features/api/api-client.ts` (typed wrapper for `/phase2/*` REST endpoints)
- [x] `app/composition/runtime.ts` — composition root (lowdb + ADO context + Azure adapters wired through `FetchAzureRestClient` + `AzureCliTokenProvider`)

HTTP server:
- [x] `/phase2/sets` GET / POST / PATCH / DELETE (CSRF-protected for writes), plus `/phase2/active-set` POST for the active pointer
- [x] `/phase2/active-set/snapshot/stream` GET (SSE) — see §7.2
- [x] `/phase2/saved-queries` GET — list shared queries
- [x] `/phase2/test-plans` GET (paged) — list plans for set creation
- [x] `/phase2/test-plans/{planId}/suites` GET — root suite list for set creation
- [x] `/phase2/ado-context` GET / POST

Side-effects landed in this phase:
- [x] Added `domain/test-management/test-plan.ts` (`TestPlanSummary`, `TestSuiteSummary`) and `application/ports/test-catalog.port.ts` so the Set-creation pickers stay Azure-agnostic.
- [x] Added `adapters/azure-devops/test-management/azure-test-catalog.adapter.ts` (paged plans + flat suites, `5.0` API).
- [x] Introduced `shared/azure-devops/azure-cli-token-provider.ts` (caches the Azure DevOps bearer with 2-min skew refresh, AAD resource id `499b84ac-1321-427f-aa17-267ca6975798`).
- [x] Introduced `shared/azure-devops/fetch-azure-rest-client.ts` (production HTTP client; bearer or PAT; normalizes status / json / headers for the existing adapters).
- [x] Refactored `app/bootstrap/http-server.ts` to receive a typed `HttpServerDependencies` block and delegate routing to feature modules under `app/bootstrap/routes/*` (route-helpers, ado-context-routes, sets-routes, catalog-routes, active-set-snapshot-route).
- [x] Extended `loadActiveSetSnapshot` with an optional `onProgress` sink emitting `context` → `test-cases` → `saved-query` → `aggregate` → `done` so the SSE handler can report stages without leaking adapter internals.

Phase-5 hardening (post-audit, follow-up commit):
- [x] Introduced `application/ports/user-preferences.port.ts`; `Runtime`/`HttpServerDependencies` now expose `AuthPreflightPort` + `UserPreferencesPort` instead of concrete adapter classes (closes a hexagonal leak).
- [x] Split `set-manager-dialog.tsx` (was 544 lines) into `set-manager-dialog.tsx`, `set-manager-list.tsx`, `set-editor.tsx`, `ado-context-setup.tsx`, `select-from-catalog.tsx`.
- [x] Extracted `useAdoContext`, `useTestPlanCatalog`, `useSavedQueries` and `useAuthPreflight` so components stop calling `api-client` directly (per AGENTS.md §"Persistenzzugriff kapseln").
- [x] Added missing unit tests: `runtime.spec.ts`, `api-client.spec.ts`, `catalog-routes.spec.ts`, `active-set-snapshot-route.spec.ts`, `use-active-set-snapshot.spec.tsx`, `set-manager-list.spec.tsx`.
- [x] Live smoketest of `npm run start:local` — verified `/health`, `/`, `/phase2/auth-preflight`, CSRF rejection (403) + acceptance (200) on `/phase2/ado-context`, sets CRUD + active-set switching, SSE stream emits `progress` events through Node's HTTP transport.

Acceptance check:
- [x] Quality gate green (41 test files, 213 tests, 77 source files cycle-free)
- [x] Commit hashes: `beeb147` (initial), `73f5b03` (post-audit hardening)

---

### Phase 6 — RelationsView (two columns + Move mode) `[x]` _(480a39b)_

**Goal:** rendered view, draggable items, suite tree collapsible.
**Acceptance:** items render in two columns; suite hierarchy on the left collapses per suite; positions snap to 20 px grid and persist per set.

Files:
- [x] `features/relations-view/relations-pane.tsx` (orchestrator, no business logic)
- [x] `features/relations-view/test-case-column.tsx` — suite tree, indent by depth, collapse toggles
- [x] `features/relations-view/work-item-column.tsx` — flat list from query
- [x] `features/relations-view/test-case-card.tsx`, `work-item-card.tsx`
- [x] Hooks:
  - [x] `use-item-positioning.ts` — pointer events, snap-to-grid, optimistic-then-persist
  - [x] `use-suite-collapse.ts` — collapse state per suite
  - [x] `use-mode-switch.ts` — folded into the existing `mode.ts` helpers in `ui-client.tsx`; no separate hook needed (state already lives in the orchestrator per §7.3)
- [x] `local-ui-shell.css` — `.relations-view*` styles per §7.4
- [x] Layout state persisted via `persistUserPreferencesPatch({ setLayouts: { [setId]: { positions, collapsedSuites } } })`

Side-effects landed in this phase:
- [x] Added `features/relations-view/item-key.ts` to mint stable `tc:<workItemId>:<suiteId>` / `wi:<workItemId>` keys for the positions map (same Test Case can appear in multiple suites, so per §5 the test-case key carries `suiteId`).
- [x] Removed `features/relations-view/relations-view-placeholder.tsx`; `ui-client.tsx` now wires `RelationsPane` directly and the redundant `.relations-view-summary` CSS block was deleted.
- [x] Suite-tree collapse hides every descendant suite below the collapsed node (depth-tracking filter in `test-case-column.tsx`), matching the "click parent → entire subtree collapses" affordance.
- [x] Positions are stored as additive offsets `{x, y}` applied via `transform: translate3d(...)` on top of the natural in-flow position so new items always land in a deterministic spot before any drag.

Acceptance check:
- [x] Quality gate green (45 test files, 231 tests, 84 source files cycle-free)
- [x] Commit hash: `480a39b`

---

### Phase 7 — Line Layer & Edit Mode `[x]` _(pending commit)_

**Goal:** edit relations live in Azure DevOps.
**Acceptance:** existing `Related` links render as lines on load; drag-from-source → drop-on-target adds a relation (live PATCH W1); selecting a line + Delete removes it (live PATCH W2). Optimistic update with rollback on PATCH failure.

Files:
- [x] `features/relations-view/relation-line-layer.tsx` — SVG overlay (anchor-driven coords, ResizeObserver + scroll/resize listeners)
- [x] `features/relations-view/use-line-drawing.ts` — drag-to-connect via window pointer listeners; `document.elementFromPoint` resolves drop target
- [x] `features/relations-view/use-relation-mutations.ts` — local "added/removed" overrides over snapshot truth, optimistic update + rollback on API rejection (TanStack Query deferred — single-user local tool, plain hook is enough; revisit in Phase 9 if request fan-out grows)
- [x] `features/relations-view/use-line-selection.ts` — single-selection state, Delete/Backspace keybinding (skips when typing in inputs), Esc clears
- [x] HTTP routes:
  - [x] `POST /phase2/relations` body `{ sourceId, targetId }` → uses `CreateRelation` use case
  - [x] `DELETE /phase2/relations` body `{ sourceId, targetId }` → uses `DeleteRelation` use case

Side-effects landed in this phase:
- [x] `features/relations-view/item-key.ts` gained `parseItemKey` so the line layer / mutation hook can decode raw `data-item-key` values back to `{ workItemId, suiteId? }` without re-running the regex in three places.
- [x] `draggable-card.ts` learned an optional `editPointerDown` so cards route their pointer-down to either positioning (move-mode) or line-drawing (edit-mode); `RelationsPane` is the only consumer so far. Picks one role per gesture — the two modes never overlap.
- [x] `relations-pane.tsx` now owns the `containerRef` for the SVG overlay, builds the snapshot relation set from **both** sides of `relatedIds` (Azure mirrors `System.LinkTypes.Related`, but real plans see partial data), and threads mutations + drawing + selection into the column tree.
- [x] CSS additions in `local-ui-shell.css`: `.relations-view` is now `position: relative` (so the SVG can `inset: 0`), and we added `.relations-view-line-layer/-line/-line-hitbox/-line-stroke/-line-selected/-line-pending/-line-draft` plus the `.relations-view-error-banner` that surfaces failed PATCHes.
- [x] Snapshot relations are filtered to pairs whose work-item id appears in the saved query result — so a Test Case's stale `relatedIds` to deleted/unscoped work items don't render as lines.

Acceptance check:
- [x] Quality gate green (50 test files, 265 tests, 90 source files cycle-free)
- [x] Commit hash: ____ (pending push)

---

### Phase 8 — Filters per Column `[ ]`

**Goal:** the filter set from §3 row 10.
**Acceptance:** filter bar per column; persists per set; pure function applied to projections; filters compose (AND-of-bars).

Files:
- [ ] `features/filters/filter-bar.tsx` — per-column filter UI
- [ ] `features/filters/test-case-filters.ts` — pure filter on `TestCaseProjection[]`
- [ ] `features/filters/work-item-filters.ts` — pure filter on `WorkItem[]`
- [ ] Filters:
  - [ ] Last Outcome multi-select (left only): Passed / Failed / NotRun / Blocked / NotApplicable / Other
  - [ ] Title full-text (both)
  - [ ] State multi-select (both)
  - [ ] AssignedTo multi-select (both) — chip list of distinct values
  - [ ] Tags multi-select (both)
  - [ ] WorkItemType multi-select (both)
- [ ] Persistence: `setFilters[setId] = { lastOutcomes?: [], titleQuery?: '', states?: [], ... }` via `persistUserPreferencesPatch`

Acceptance check:
- [ ] Quality gate green
- [ ] Commit hash: ____

---

### Phase 9 — Polish & Quality Gate `[ ]`

**Goal:** ship-ready v1.
**Acceptance:** light/dark visual review on every screen, Playwright E2E covers golden path + delete-line + set-switch, coverage ≥ 80 %, no cycles, clean commit history.

- [ ] Light/dark visual sweep on every screen
- [ ] Playwright E2E with mock Azure backend (golden path + delete-line + set-switch)
- [ ] Coverage ≥ 80 % on changed lines
- [ ] `npm run quality:gate` includes `test:e2e`
- [ ] ADRs from §12 published under `docs/adr/`
- [ ] C4 light docs (`docs/c4/{context,container,component}.md`)
- [ ] Commit hash: ____

---

## 12 · ADRs to Write

Add new ADRs as `docs/adr/0XXX-<slug>.md`. Format: Context · Decision · Consequences. Phase 9 deliverable.

- [ ] **ADR-0001 — Azure CLI auth as primary, PAT as fallback.** Reuses local credentials, avoids token storage. Trade-off: requires `az login` and `azure-devops` extension.
- [ ] **ADR-0002 — Server-Sent Events for refresh progress.** Plain HTTP, native `EventSource`, fits one-way fan-out. WebSocket considered overkill for v1.
- [ ] **ADR-0003 — SVG overlay for relation lines (vs Canvas).** Selectable / hoverable per-line for free; performance acceptable up to ~500 lines.
- [ ] **ADR-0004 — Live PATCH for relations (vs queued save).** Single-user local tool; optimistic update + retry covers the failure modes; "save" buttons add UX overhead.
- [ ] **ADR-0005 — Set as `(plan, rootSuite, query)` triple.** Mirrors how testers think of "this release". More general schemas (multi-query, multi-suite) deferred until a real need surfaces.
- [ ] **ADR-0006 — lowdb schema versioning policy.** Tolerant sanitizer + version field + sequential upgraders. Covers Phase 4/6/8 schema evolution.
- [ ] **ADR-0007 — `(workItemId, suiteId)` as projection key.** Same Test Case in multiple suites = multiple rows; matches how Azure DevOps Test Plans surface them.

---

## 13 · Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Rate-limit storms when loading large plans (thousands of `/test/Runs/{id}/results` calls) | Medium | High | `mapConcurrent(8)` per fan-out + `requestWithRetry` per call. Surface retry counts in the UI's refresh progress (Phase 5). |
| R2 | Result has `null` `testSuite.id` (older runs) → aggregator drops it | Medium | Medium | Logged/counted in aggregator; consider fallback via `pointId → suiteId` map if dropped count is high in real plans. |
| R3 | Optimistic concurrency conflict on relation PATCH (concurrent editor) | Low | Low | `op:test /rev` + 409 retry once; surface as toast on second failure. |
| R4 | CSRF token rotates on server restart — long-lived browser sessions break | High | Low | Acceptable for v1 (local-only). Reload fixes it. Revisit if multi-window editing becomes common. |
| R5 | lowdb schema evolution bricks existing user files | Low | High | Tolerant sanitizer + sequential migrators (§8.3). Never delete fields silently. |
| R6 | Snap-to-grid + variable item heights produce visual misalignment | Medium | Low | Snap top-left only; let height vary; line endpoints anchor to card edge midpoint, not card top-left. |
| R7 | Saved query returns thousands of work items (slow hydration) | Medium | Medium | Hydration adapter chunks at 200 ids with `mapConcurrent(4)`; UI shows progress; consider per-set work-item cap warning in Phase 5. |
| R8 | Azure CLI bearer token expires mid-session (≈1h) | High | Low | Local server already refreshes via `account get-access-token` with 2-min skew (Phase 1). |
| R9 | User picks a Set whose Plan / Suite / Query was deleted in Azure | Low | Medium | Phase 5 set-loading surfaces 404 from any of the three calls as a "set is broken — edit or delete" banner. |

---

## 14 · Open Questions & Follow-ups

- [ ] Phase 5+: HEAD support on the static / favicon routes (low priority; browsers don't send HEAD for assets, but reverse proxies might).
- [ ] Phase 5: ADO context bootstrap UX. If `~/.azure-testops/ado-context.json` is missing on first run, the manage-sets dialog must collect org/project before it can let the user create a set.
- [ ] Phase 5/6: when a set has > 10 k results, show a "Refresh dauert lange — Cancel" affordance during SSE stream.
- [ ] Phase 6: anchor-point recomputation on item drag is O(n) per move. If a set has > 500 lines, batch via `requestAnimationFrame`.
- [ ] Phase 7: undo (`Ctrl+Z`) for relation edits — stretch goal in Phase 9.
- [ ] Phase 8: filter UI should remember last-used values across sets as a quality-of-life soft default (separate from per-set persistence).
- [ ] Phase 9: ADR-skeleton + C4 light docs land here.
- [ ] OSS-readiness checklist (Phase 9): LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, public README rewrite. Mirror AzureGanttOps when ready.

---

## 15 · Repo / Operations

- Remote: `https://github.com/tensor-five/AzureTestOps` (private, same org as AzureGanttOps). Closed source until v1 ships (see §3 row 11) — flip the GitHub repo to public as part of the OSS-readiness checklist in §14.
- Default port `8081` (`PORT` env overrides) so it can run alongside AzureGanttOps on `8080`.
- Local data directory: `~/.azure-testops/` (`user-preferences.json` + `ado-context.json`).
- Commit style: `feat:` / `fix:` / `refactor:` with `Co-Authored-By: T5.Code <code@tensorfive.com>` trailer. **No** Claude/AI attribution. **No** emojis in commits.
- Pre-commit: husky → lint-staged → secret-scan (`scripts/secret-scan.mjs`). Blocks committing files containing `BEGIN PRIVATE KEY`, AWS access keys, GitHub tokens, JWTs, etc.
- Quality gate: `npm run quality:gate` = `typecheck` + `check:cycles` + `vitest run`. Must be green before every commit.
- Build: `npm run build` (tsc + esbuild bundle for the browser). One-click launchers (`Start Azure TestOps.command/.cmd`) handle install + build + start + open browser.
