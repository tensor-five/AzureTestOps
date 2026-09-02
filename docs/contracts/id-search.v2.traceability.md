# Traceability-Matrix: Contains-Suche nach Work-Item-IDs und Titeln v2

Vertrag: `docs/contracts/id-search.v2.html`

| Vertragsanforderung | Testdatei | Testname |
| --- | --- | --- |
| IDSC-01 | `src/features/filters/id-search.v2.contract.spec.tsx`, `tests/e2e/id-search.v2.contract.spec.ts` | `IDSC-01 und IDSC-03 finden Zahlenteiltreffer in Bug-IDs und Bug-Titeln, mit optionalem #`; `IDSC-01 bis IDSC-07 wenden die Contains-Suche auf IDs, Titel und Suite-Pfade an` |
| IDSC-02 | `src/features/filters/id-search.v2.contract.spec.tsx`, `tests/e2e/id-search.v2.contract.spec.ts` | `IDSC-02 und IDSC-03 finden Zahlenteiltreffer in Test-Case-IDs, Titeln und Suite-Pfaden`; `IDSC-01 bis IDSC-07 wenden die Contains-Suche auf IDs, Titel und Suite-Pfade an` |
| IDSC-03 | `src/features/filters/id-search.v2.contract.spec.tsx`, `tests/e2e/id-search.v2.contract.spec.ts` | `IDSC-01 und IDSC-03 finden Zahlenteiltreffer in Bug-IDs und Bug-Titeln, mit optionalem #`; `IDSC-02 und IDSC-03 finden Zahlenteiltreffer in Test-Case-IDs, Titeln und Suite-Pfaden`; `IDSC-01 bis IDSC-07 wenden die Contains-Suche auf IDs, Titel und Suite-Pfade an` |
| IDSC-04 | `src/features/filters/id-search.v2.contract.spec.tsx`, `tests/e2e/id-search.v2.contract.spec.ts` | `IDSC-04 hebt Zahlenteiltreffer in IDs und Titeln hervor`; `IDSC-01 bis IDSC-07 wenden die Contains-Suche auf IDs, Titel und Suite-Pfade an` |
| IDSC-05 | `src/features/filters/id-search.v2.contract.spec.tsx`, `tests/e2e/id-search.contract.spec.ts` | `IDSC-05 bis IDSC-07 erhalten Facetten, leere, gemischte und groß-/kleingeschriebene Eingaben`; `IDS-05 erhält Ergebnisanzahl, Schnellfilter, Sortierung und manuelle Drag-and-drop-Reihenfolge` |
| IDSC-06 | `src/features/filters/id-search.v2.contract.spec.tsx`, `tests/e2e/id-search.v2.contract.spec.ts` | `IDSC-05 bis IDSC-07 erhalten Facetten, leere, gemischte und groß-/kleingeschriebene Eingaben`; `IDSC-01 bis IDSC-07 wenden die Contains-Suche auf IDs, Titel und Suite-Pfade an` |
| IDSC-07 | `tests/e2e/id-search.v2.contract.spec.ts` | `IDSC-01 bis IDSC-07 wenden die Contains-Suche auf IDs, Titel und Suite-Pfade an` |

Die Tests leiten ihr geprüftes Verhalten ausschließlich aus dem eingefrorenen Vertragsartefakt ab.
