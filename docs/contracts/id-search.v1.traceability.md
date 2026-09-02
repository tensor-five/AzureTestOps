# Traceability-Matrix: Suche nach Work-Item-IDs v1

Vertrag: `docs/contracts/id-search.v1.html`

| Vertragsanforderung | Testdatei | Testname |
| --- | --- | --- |
| IDS-01 | `src/features/filters/id-search.contract.spec.tsx`, `tests/e2e/id-search.contract.spec.ts` | `IDS-01 und IDS-03 finden einen Bug über seine vollständige ID mit oder ohne führendes #`; `IDS-01 bis IDS-04 suchen Bugs und Test Cases über vollständige IDs und heben Treffer hervor` |
| IDS-02 | `src/features/filters/id-search.contract.spec.tsx`, `tests/e2e/id-search.contract.spec.ts` | `IDS-02 und IDS-03 finden einen Test Case über seine vollständige ID mit oder ohne führendes #`; `IDS-02 behält die getrennte Suche nach Test-Case-Titel und Suite-Pfad bei`; `IDS-02, IDS-04, IDS-06 und IDS-07 erhalten Textsuche, Hervorhebung und Tastaturbedienung` |
| IDS-03 | `src/features/filters/id-search.contract.spec.tsx`, `tests/e2e/id-search.contract.spec.ts` | `IDS-01 und IDS-03 finden einen Bug über seine vollständige ID mit oder ohne führendes #`; `IDS-02 und IDS-03 finden einen Test Case über seine vollständige ID mit oder ohne führendes #`; `IDS-03 findet weder Teil-IDs noch IDs, die die vollständige ID nur enthalten`; `IDS-01 bis IDS-04 suchen Bugs und Test Cases über vollständige IDs und heben Treffer hervor` |
| IDS-04 | `src/features/filters/id-search.contract.spec.tsx`, `tests/e2e/id-search.contract.spec.ts` | `IDS-04 hebt eine per ID gefundene Bug- und Test-Case-ID auf der Karte hervor`; `IDS-04 behält die bestehende Hervorhebung in Bug- und Test-Case-Titeln bei`; `IDS-02, IDS-04, IDS-06 und IDS-07 erhalten Textsuche, Hervorhebung und Tastaturbedienung` |
| IDS-05 | `src/features/filters/id-search.contract.spec.tsx`, `tests/e2e/id-search.contract.spec.ts` | `IDS-05 kombiniert die ID-Suche weiterhin mit den bestehenden Facetten`; `IDS-05 lässt die vorhandene Reihenfolge und den Schnellfilter bei der ID-Suche bestehen`; `IDS-05 erhält Ergebnisanzahl, Schnellfilter, Sortierung und manuelle Drag-and-drop-Reihenfolge` |
| IDS-06 | `src/features/filters/id-search.contract.spec.tsx`, `tests/e2e/id-search.contract.spec.ts` | `IDS-06 behält die bestehende Textsuche für Bugs und Test Cases bei`; `IDS-06 lässt leere und gemischt-numerische Eingaben als bestehende Textsuche unverändert`; `IDS-02, IDS-04, IDS-06 und IDS-07 erhalten Textsuche, Hervorhebung und Tastaturbedienung` |
| IDS-07 | `tests/e2e/id-search.contract.spec.ts` | `IDS-02, IDS-04, IDS-06 und IDS-07 erhalten Textsuche, Hervorhebung und Tastaturbedienung` |

Die Tests leiten ihr geprüftes Verhalten ausschließlich aus dem eingefrorenen Vertragsartefakt ab. Sie definieren kein Produktverhalten außerhalb dieses Vertrags.
