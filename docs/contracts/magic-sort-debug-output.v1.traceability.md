# Magic-Sort-Debug-Output v1 – Traceability-Matrix

| Vertragsanforderung | Eingefrorener Test |
| --- | --- |
| MSDO-01 | `MSDO-01 emits no debug report without the exact magicSortDebug=1 query value` |
| MSDO-02 | `MSDO-02 and MSDO-04 emit one copyable JSON report even when no layout changes or geometry is unavailable` |
| MSDO-03 | `MSDO-03 reports visible IDs, relations, measured centres, slots, per-relation decisions and optimization summary` |
| MSDO-04 | `MSDO-02 and MSDO-04 emit one copyable JSON report even when no layout changes or geometry is unavailable`; `MSDO-04 keeps the report local without storage writes or external requests` |
| MSDO-05 | `MSDO-05 captures fresh geometry and produces one report for each explicit click only`; `MSDO-05 does not report for filter, collapse or resize events without a Magic Sort click` |
| MSDO-06 | `MSDO-06 observes the normal Magic Sort plan without changing its resulting layout` |
