# CLAUDE.md

## Rolle und Auftrag
Du bist ein **Senior Software Architect + Staff Engineer** und sollst dieses Projekt als **Greenfield-Neuentwicklung** umsetzen.

Dein Ziel ist eine robuste, wartbare Lösung für:
**Azure DevOps Test Cases ↔ Bugs Relations Editor (v1)**.

Das Tool orientiert sich strukturell und visuell **eng an AzureGanttOps** (gleiche Hexagonal-Architektur, gleicher UI-Look: Header, Footer, Farben, Schriftart, Schriftgrößen).

---

## Produktziel

Ein lokal betriebenes Tool, das aus Azure DevOps zwei Komponenten zusammenbringt:

1. **Test Cases** (mit Test Suite Hierarchie, inkl. korrekter Verknüpfung von Test Runs, Test Points, Test Results für Outcome-Aggregation pro `(WorkItemID, SuiteID)`)
2. **Bugs / Work Items** (basierend auf einer Azure DevOps Saved Query)

In einer zweispaltigen Ansicht mit **zwei Modi**:
- **Edit-Modus**: Linien zwischen Test Cases und Bugs ziehen → erzeugt einen `System.LinkTypes.Related`-Link in Azure DevOps (live PATCH).
- **Move-Modus**: Items per Snap-to-Grid frei platzieren (Position pro Set in lowdb persistiert).

Die Auswahl wird über **Sets** organisiert (`Set = Plan + Wurzel-Suite + Query`), zwischen denen via Header-Dropdown gewechselt wird.

---

## Verbindliche Architektur- und Qualitäts-Pillars (Non-negotiable)

1. Hexagonal Architecture (Ports & Adapters)
2. Clean Architecture
3. SOLID
4. Tactical DDD / bounded-context-oriented module boundaries
5. Twelve-Factor App mindset
6. C4-model documentation mindset
7. Maintainability-Fokus (ISO/IEC 25010)
8. Quality Gate Ziel:
   - Sonar Rating A
   - Coverage >= 80%
   - Keine zyklischen Abhängigkeiten

Zusätzlich:
- Keine Dummy-/Fake-/Placeholder-Produktlogik einbauen.
- Live-Berechnung statt Hardcoded/Dummy-Logik.
- Wenn etwas noch fehlt: explizit `[@TODO] not yet implemented` statt Fake-Verhalten.
- Probleme nicht direkt in Containern patchen; Code ändern und Umgebung sauber neu bauen.

---

## Bounded Contexts

| Context | Inhalt |
|---|---|
| **Test Management** | TestPlan, TestSuite (Tree), TestCase, TestPoint, TestRun, TestResult, OutcomeAggregator |
| **Work Items** | WorkItem (generisch), Saved Queries (übernommen aus AzureGanttOps) |
| **Relations** | `System.LinkTypes.Related` zwischen WorkItem-IDs |
| **Sets** | Set-Definition, aktive Auswahl, Layout-State (Positionen + Filter pro Set) |

### Zentrale Domain-Projektion: `TestCaseProjection`

Pro **(WorkItemID, SuiteID)**-Kombination eine Projektion mit `lastOutcome` = Outcome des Results mit dem neuesten `completedDate` an dem zugehörigen TestPoint. Ohne diese Aggregation funktioniert der "letztes Result = grün"-Filter nicht.

---

## Zielarchitektur (konkret)

```text
src/
  app/
    composition/
    config/
    bootstrap/
  domain/
    test-management/      # TestSuiteTree, TestCaseProjection, OutcomeAggregator
    work-items/           # WorkItemProjection
    relations/            # RelationLink Domain
    sets/                 # Set, LayoutState
  application/
    use-cases/            # LoadActiveSetSnapshot, CreateRelation, DeleteRelation, ...
    ports/                # TestPlanPort, TestSuitePort, RelationPort, SetRepositoryPort, ...
    dto/
  adapters/
    azure-devops/
      auth/               # CLI preflight (übernommen)
      queries/            # Saved Query runtime (übernommen)
      test-management/    # plans/suites/points/runs/results
      work-items/         # hydration + relations PATCH
    persistence/
      settings/           # lowdb sets, layout, filters, theme
    telemetry/
  features/
    relations-view/       # zwei Spalten + Linien-Layer
    set-management/       # Set CRUD Dialog
    filters/              # Filter-Bar pro Spalte
    navigation/
  shared/
    types/
    utils/
    errors/
    security/
    user-preferences/
    azure-devops/
```

### Pflichtprinzipien

- UI kennt nur Application Use Cases, niemals Azure DTOs direkt.
- Azure-spezifische Details bleiben in Adaptern.
- Domain-Modell ist Azure-agnostisch.
- Read und Write strikt getrennt (Command-Seite isoliert).

---

## Datenpipeline (verbindlich)

1. Aktives Set laden: `(planId, rootSuiteId, queryId)`
2. **Test-Pfad** (parallel): Suite-Tree (rekursiv) → Test Cases pro Suite → Test Points pro Suite → Test Runs für Plan → Test Results pro Run
3. **Aggregation**: Pro `(WorkItemID, SuiteID)` → `lastOutcome` aus dem Result mit größtem `completedDate`
4. **Bug-Pfad**: Saved Query ausführen → IDs/Relations → Work Item Details in Chunks (max 200/Request)
5. **Relations**: Aus jedem Work Item die `System.LinkTypes.Related` extrahieren
6. **Render**: Zwei Spalten, Linien zwischen verknüpften Items, Filter angewendet

### Kritische Fehler, die zu vermeiden sind

1. Test Results unsauber zu Test Cases joinen (Matching ist `TestCase_ID` + `TestSuite_ID`)
2. Suite-Hierarchie verlieren beim Laden
3. Race-Conditions beim parallelen Fetch (>100 Workers)
4. Zeitzonen-/DST-Drift bei `completedDate`-Sort
5. Stillschweigende Verluste bei partial failures

---

## Persistenz-Policy

### Standard für lokale Nutzerdaten

- `lowdb` ist die führende Persistenzschicht.
- Speicherort: `~/.azure-testops/user-preferences.json`.
- Sets, Positionen, Filter, Theme: alles dort.
- API: `GET/PATCH /phase2/user-preferences`.

### Was wird persistiert

- Aktives Set, Set-Liste
- Layout pro Set (Positionen, Filter, eingeklappte Suites)
- Theme-Mode (system/light/dark) — Fallback in `localStorage`
- ADO-Context (organization/project) — `~/.azure-testops/ado-context.json`

### Abgrenzung zu localStorage und Cache

- `localStorage` nur als Fallback im Frontend, nicht als führende Quelle.
- Kein separater Cache-Layer für Preferences.
- Test-Snapshot wird **in Memory** gehalten und nur per Refresh-Button aktualisiert (nicht persistiert).

---

## Roadmap

| Phase | Inhalt | Akzeptanz |
|---|---|---|
| 0 | Projekt-Setup, Architektur-Skeleton, Quality-Gate verdrahtet | `npm run quality:gate` läuft |
| 1 | Foundation 1:1 aus AzureGanttOps (Auth, lowdb, Theme, Header/Footer) | App startet, Theme-Toggle, Auth-Preflight |
| 2 | Test Management Domain + 5 Adapter + OutcomeAggregator | Aggregation per (workItemId, suiteId), last-completedDate-wins |
| 3 | Work Items + Relations (PATCH `relations[]`) | CreateRelation/DeleteRelation getestet |
| 4 | Sets (CRUD + LoadActiveSetSnapshot) | Set wechseln/anlegen/löschen |
| 5 | UI Foundation (Header, Set-Dropdown, Refresh) | Header-Dropdown, Refresh mit Progress |
| 6 | RelationsView (zwei Spalten, Suite-Tree, Move-Modus) | Items draggbar mit Snap-to-Grid |
| 7 | Linien-Layer & Edit-Modus | Linie ziehen/löschen → live PATCH in Azure |
| 8 | Filter pro Spalte (Outcome, Title, State, AssignedTo, Tags, Type) | Filter persistent pro Set |
| 9 | Polish, E2E, Coverage ≥80%, Cycle-Check | Quality Gate grün |

---

## Qualitätsstrategie und Definition of Done

Eine Phase gilt nur als „done", wenn:

1. Funktionale Anforderungen erfüllt.
2. Automatisierte Tests vorhanden (Unit + ggf. Integration/E2E).
3. Coverage-Richtung Road to >=80%.
4. Lint/Format/Typecheck ohne Fehler.
5. Keine zyklischen Abhängigkeiten.
6. Relevante Architekturentscheidungen via ADR dokumentiert.
7. Keine Dummy-Implementierungen im Produktverhalten.

---

## Sicherheits- und Robustheitsanforderungen

- Keine Secrets im Code/Repo.
- Keine Browser-seitigen direkten Azure Tokens für Core-Calls.
- Fehler nachvollziehbar, aber ohne sensitive Daten.
- Explizite Behandlung von:
  - Rate limiting (Backoff + Retry)
  - API timeouts
  - Partial data failures
  - Optimistic concurrency bei Relations-PATCH

---

## UI-Design

Das visuelle Erscheinungsbild orientiert sich **strikt an AzureGanttOps**:

- **Schriftart**: Satoshi (Fontshare) — `--font-display`, `--font-body`
- **Primärfarbe**: `#842CC3` (Lila), Sekundär `#87F3A4`
- **Layout**: Fixierter Header oben, fixierter Footer unten, `main` dazwischen mit `padding: 70px 0 32px`
- **Header-Markup**: `.ui-shell-header > .ui-shell-brand` (h1 mit Produktname) + `.ui-shell-header-actions`
- **Footer-Markup**: `.ui-shell-footer` (kleiner, transparenter Streifen am unteren Rand)
- **Tokens**: alle CSS-Custom-Properties aus `local-ui-tokens.css` 1:1 übernommen
- **Theme**: light/dark via `data-theme`-Attribut auf `<html>`, persistiert via lowdb (Fallback localStorage)

---

## Git- und Delivery-Konventionen

- Commit-Style: `feat:` / `fix:` / `refactor:` mit klarer Aussage.
- Trailer:

```
Co-Authored-By: T5.Code <code@tensorfive.com>
```

- Keine Claude/AI-Attribution, keine Emojis, keine Tool-Referenzen in Commit Messages.
- Für abgeschlossene Änderungen gehören Commit + Push zum Done-State.

---

## Erfolgskriterium

Das Projekt ist erfolgreich, wenn v1 als Test-Cases-↔-Bugs-Relations-Editor **fachlich korrekt, technisch stabil und architektonisch sauber** betrieben werden kann — als Schwesterprojekt zu AzureGanttOps mit identischer Look-&-Feel-Sprache.
