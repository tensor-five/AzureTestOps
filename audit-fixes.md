# AGENTS.md Policy Audit — Fix Plan

> Audit-Datum: 2026-04-29. Quelle: scan gegen `AGENTS.md` + `CLAUDE.md`.
> Vorgehen: Findings einzeln abarbeiten, jedes mit Tests + `npm run quality:gate`, dann committen.

## HIGH

### H1 — Preferences-Store fehlt: `createUserPreferenceStore<T>` mit `sanitize` + `buildPatch`

- [x] **Datei:** `src/shared/user-preferences/user-preferences.client.ts:23-60`
- **Problem:** Modul-globaler `cachedPreferences`-State + freie Funktionen `getCachedUserPreferences`/`persistUserPreferencesPatch`. Kein Store-Factory, kein `buildPatch`.
- **AGENTS.md §Preferences:** *„Für neue/angepasste Preferences immer `createUserPreferenceStore<T>` nutzen … `sanitize` und `buildPatch` sind Pflicht."*
- **Fix:** Generische Factory `createUserPreferenceStore<T>({ select, sanitize, buildPatch })` einführen (analog AzureGanttOps). Bestehende Aufrufstellen darauf migrieren. Modul-globaler Cache durch Store-Instanz ersetzen.
- **Akzeptanz:** Alle Konsumenten lesen/schreiben über Store; `buildPatch` produziert minimalen PATCH; bestehende Tests grün.

### H2 — Spec für `user-preferences.client.ts` fehlt

- [x] **Datei:** `src/shared/user-preferences/user-preferences.client.ts` (kein zugehöriges `.spec.ts`)
- **AGENTS.md §Testkonventionen:** *„Jede ausgelagerte Utility/Service-Datei bekommt eigene Unit-Tests."*
- **Fix:** Nach H1 — `user-preferences.client.spec.ts` mit Coverage für: read-cache, sanitize-Pfad, buildPatch-Diff, Race/Refresh, Fehlerpfade.

---

## MEDIUM

### M1 — `relations-pane.tsx` Berechnungslogik in Hook/Util auslagern

- [x] **Datei:** `src/features/relations-view/relations-pane.tsx:387-490`
- **Helpers inline:** `buildSnapshotRelationSet`, `buildLineSpecs`, `resolvePairFromItemKeys`, `parseLineId`, `countPositions`.
- **AGENTS.md §1:** *„`relations-pane.tsx` nur als Orchestrator weiterentwickeln … neue komplexe State-Blöcke zuerst als Hook anlegen."*
- **Fix:** Auslagern in `use-snapshot-relations.ts` (oder reine Util `relation-line-specs.ts`) + dedizierte Specs.

### M2 — `http-server.ts` mehrere Verantwortlichkeiten

- [x] **Datei:** `src/app/bootstrap/http-server.ts` (449 LOC)
- **Problem:** Vermischt Favicon-SVG, Root-HTML, Inline-Theme-Bootstrap-Skript, Server-Erstellung, Routing.
- **AGENTS.md §Clean-Code:** *„Eine Datei hat eine primäre Verantwortung."*
- **Fix:** Aufsplitten in z. B. `http-server.ts` (Server+Routing), `bootstrap-html.ts` (Root-HTML+Pre-paint-Script), `favicon.ts` (SVG-Asset).

### M3 — Hook ohne Spec: `use-ado-context.ts`

- [x] **Datei:** `src/features/set-management/use-ado-context.ts`
- **Fix:** `use-ado-context.spec.tsx` mit jsdom-Pragma, Coverage für Lade-/Persist-Pfad.

### M4 — Hook ohne Spec: `use-auth-preflight.ts`

- [x] **Datei:** `src/features/navigation/use-auth-preflight.ts`
- **Fix:** `use-auth-preflight.spec.tsx` mit jsdom-Pragma.

### M5 — Hardcoded `#16a34a` Preflight-Badge

- [x] **Datei:** `src/app/bootstrap/local-ui-shell.css:127`
- **Fix:** Success-Token in `local-ui-tokens.css` einführen (`--color-success-fg`/`-bg`) und referenzieren.

### M6 — Hardcoded Overlay `rgba(0,0,0,0.5)`

- [x] **Datei:** `src/app/bootstrap/local-ui-shell.css:853`
- **Fix:** `--color-overlay-scrim` Token definieren und nutzen.

### M7 — `.u-btn-primary { color:#ffffff }`

- [x] **Datei:** `src/app/bootstrap/local-ui-base.css:109`
- **Fix:** Durch `var(--color-on-primary)` ersetzen.

### M8 — Background-Pattern mit `rgba(28,25,23,…)` + magic Pixel

- [x] **Datei:** `src/app/bootstrap/local-ui-base.css:68-71`
- **Fix:** Pattern-Farbe + Größe aus Tokens (`--color-pattern-dot`, `--space-*`) ableiten.

### M9 — Magic-Pixel-Indent `depth * 16` im Inline-Style

- [x] **Datei:** `src/features/relations-view/test-case-column.tsx:90,95`
- **Fix:** Indent über CSS-Var (`var(--space-3)` o. ä.) oder berechnetes `calc(var(--space-3) * depth)` lösen, kein nackter Pixel-Faktor in JSX.

---

## LOW

### L1 — Token-Fallbacks mit Hex/Shadow

- [x] **Datei:** `src/app/bootstrap/local-ui-shell.css:339, 355, 1040`
- **Fix:** Tokens (`--color-on-primary`, `--shadow-md`) ohne Hex/Shadow-Fallback definieren; Fallbacks aus den `var(--token, …)`-Aufrufen entfernen.

### L2 — Hex-Farben im Inline-Favicon-SVG

- [x] **Datei:** `src/app/bootstrap/http-server.ts:46-48`
- **Fix:** Optional — Favicon als Asset-Datei mit dokumentierten Brand-Hex-Werten extrahieren (Asset-Layer, nicht Token-Layer).

### L3 — Pre-paint localStorage-Read im Inline-Skript

- [x] **Datei:** `src/app/bootstrap/http-server.ts:63-69`
- **Fix:** Kommentar im Inline-Skript ergänzen, der den lowdb-Fallback-Vertrag dokumentiert (FOUC-Schutz, lowdb übernimmt nach Mount).

### L4 — Spec fehlt: `draggable-card.ts`

- [x] **Datei:** `src/features/relations-view/draggable-card.ts`
- **Fix:** Unit-Spec für Drag-Helper.

### L5 — Bootstrap-Glue ohne Spec

- [x] **Dateien:** `src/app/bootstrap/local-server.ts`, `src/app/bootstrap/local-ui-entry.ts`
- **Fix:** Smoke-Spec (Server-Boot, Entry-Mount).

---

## Sauber (keine Action)

- Hexagonale Abhängigkeitsrichtung (domain → application/adapters: 0; application → adapters: 0).
- UI importiert nirgends direkt Azure-Adapter/DTOs.
- WorkItem-Hydration: 200er-Chunking korrekt (`azure-work-item-hydration.adapter.ts:12,35`).
- `npm run check:cycles`: 92 Dateien, keine Zyklen.
- DOM-Specs haben alle `// @vitest-environment jsdom`.
- Kein `TODO`/`FIXME`/Dummy-Logik in Produktcode.
- `localStorage` nur als Theme-Fallback strukturiert.

---

## Done-Definition pro Finding

1. Code-Fix + falls UI: visuell verifiziert.
2. Tests ergänzt/aktualisiert.
3. `npm run typecheck && npm run check:cycles && npm test` grün.
4. Commit (`feat:`/`fix:`/`refactor:` + `Co-Authored-By: T5.Code <code@tensorfive.com>`).
5. Checkbox in dieser Datei abhaken, Commit-Hash dahinter notieren.
