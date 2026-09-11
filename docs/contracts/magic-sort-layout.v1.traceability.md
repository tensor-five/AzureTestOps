# Traceability-Matrix: Magic Sort v1

| Vertrags-ID | Testdatei | Testname |
| --- | --- | --- |
| MS-01 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-01 exposes the keyboard-operable Magic Sort action with a wand symbol` |
| MS-02 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-02 preserves the existing stored order until the user chooses Magic Sort` |
| MS-03 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-03 and MSI-01 complete optimization only after the user triggers Magic Sort` |
| MS-04 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-04 keeps every test case in its own suite while Magic Sort improves the visible layout` |
| MS-06 | `docs/contracts/magic-sort-instant-apply.v1.html` | Durch MSI-01, MSI-02 und MSI-06 ausdrücklich ersetzt: nur das Endlayout wird ohne laufende Zwischenschritte übernommen. |
| MS-08 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-08 provides no undo action and MS-09 announces completion independently of colour` |
| MS-09 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-08 provides no undo action and MS-09 announces completion independently of colour` |
| MS-02 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-02 does not reorder after a filter change or a snapshot refresh` |
| MS-03 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-03 starts only for a keyboard-triggered Magic Sort action and uses only the visible items` |
| MS-05 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-05 and MSI-02 lower the layout cost by applying only the completed improvement`; `MS-05 returns the same result for identical inputs` |
| MS-06 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MSI-08 announces completion immediately and does not enter a running status`; `MS-06 finishes immediately when reduced motion is preferred` |
| MS-07 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MS-07 persists and restores both optimized orders for the active set` |
| MS-09 | `src/features/relations-view/magic-sort.contract.spec.tsx` | `MSI-08 announces completion immediately and does not enter a running status` |
