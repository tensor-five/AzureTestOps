# Traceability-Matrix: Sortierung von Tickets in Test Suites v1

Vertrag: `docs/contracts/test-suite-ticket-sorting.v1.html`

| Vertragsanforderung | Testdatei | Testname |
| --- | --- | --- |
| TSS-01 | `src/features/relations-view/test-suite-ticket-sorting.contract.spec.tsx` | `TSS-01 zeigt in jeder befüllten, ausgeklappten Test Suite einen Sortieren-Button` |
| TSS-02 | `src/features/relations-view/test-suite-ticket-sorting.contract.spec.tsx` | `TSS-02 öffnet je Suite ein Menü mit genau den vier vereinbarten Sortieroptionen` |
| TSS-03 | `src/features/relations-view/test-suite-ticket-sorting.contract.spec.tsx` | `TSS-03 ordnet nur die gewählte Test Suite unmittelbar um und belässt andere Suites unverändert` |
| TSS-04 | `src/features/relations-view/test-suite-ticket-sorting.contract.spec.tsx` | `TSS-04 sortiert vollständige Titel ohne Beachtung der Groß- und Kleinschreibung auf- und absteigend` |
| TSS-05 | `src/features/relations-view/test-suite-ticket-sorting.contract.spec.tsx` | `TSS-05 sortiert angezeigte Outcome-Werte ohne Beachtung der Groß- und Kleinschreibung auf- und absteigend` |
| TSS-06 | `src/features/relations-view/test-suite-ticket-sorting.contract.spec.tsx` | `TSS-06 erhält bei gleichen Titeln die zuvor sichtbare Reihenfolge`; `TSS-06 erhält bei gleichen Outcomes die zuvor durch Titel-Sortierung sichtbare Reihenfolge` |
| TSS-07 | `src/features/relations-view/test-suite-ticket-sorting.contract.spec.tsx` | `TSS-07 behält die bestehende Reihenfolge bis zur Auswahl und markiert die gewählte Sortierung` |
| TSS-08 | `src/features/relations-view/test-suite-ticket-sorting.contract.spec.tsx` | `TSS-08 lässt den Sortieren-Button und die Optionen per Tastatur bedienen und vermittelt die aktive Option ohne Farbe` |

Alle Tests leiten ihr geprüftes Produktverhalten ausschließlich aus dem eingefrorenen Vertragsartefakt ab. Der aktuelle Stand ist erwartungsgemäß rot, weil die Produktfunktion noch nicht implementiert ist.
