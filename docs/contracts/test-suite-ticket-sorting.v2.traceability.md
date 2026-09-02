# Traceability-Matrix: Einmalige Sortierung von Tickets in Test Suites v2

Vertrag: `docs/contracts/test-suite-ticket-sorting.v2.html`

| Vertragsanforderung | Testdatei | Testname |
| --- | --- | --- |
| TSS2-01 | `src/features/relations-view/test-suite-ticket-sorting.v2.contract.spec.tsx` | `TSS2-01 zeigt im Kopfbereich nur einen dezenten Sortier-Symbolschalter` |
| TSS2-02 | `src/features/relations-view/test-suite-ticket-sorting.v2.contract.spec.tsx` | `TSS2-02 öffnet über das Symbol genau die vier vereinbarten Optionen` |
| TSS2-03 | `src/features/relations-view/test-suite-ticket-sorting.v2.contract.spec.tsx` | `TSS2-03 sortiert nur die gewählte Suite einmal, schließt das Menü und übergibt die neue manuelle Reihenfolge` |
| TSS2-04 | `src/features/relations-view/test-suite-ticket-sorting.v2.contract.spec.tsx` | `TSS2-04 sortiert Titel und Outcomes ohne Beachtung der Groß- und Kleinschreibung` |
| TSS2-05 | `src/features/relations-view/test-suite-ticket-sorting.v2.contract.spec.tsx` | `TSS2-05 erhält bei gleichem Sortierwert die unmittelbar zuvor sichtbare Reihenfolge` |
| TSS2-06 | `src/features/relations-view/test-suite-ticket-sorting.v2.contract.spec.tsx` | `TSS2-06 überlässt die Suite nach dem Impuls vollständig der manuellen Reihenfolge` |
| TSS2-07 | `src/features/relations-view/test-suite-ticket-sorting.v2.contract.spec.tsx` | `TSS2-07 stellt die einmalig sortierte Reihenfolge über die bestehende manuelle Persistenz wieder her` |
| TSS2-08 | `src/features/relations-view/test-suite-ticket-sorting.v2.contract.spec.tsx` | `TSS2-08 lässt das Symbol und alle Optionen per Tastatur bedienen` |

Die Tests leiten ihr geprüftes Verhalten ausschließlich aus dem eingefrorenen Vertragsartefakt ab. Vertrag v2 ersetzt für diese Funktion die v1-Anforderungen und deren Vertrags-Testlauf.
