# Traceability: Magic Sort wendet nur das Endlayout an

Alle Erwartungen dieses Test-Gates stammen ausschließlich aus `magic-sort-instant-apply.v1.html`, verifiziert durch `magic-sort-instant-apply.v1.sha256`. Die Bezeichnungen von Komponenten, Hooks und Testfällen sind keine zusätzlichen Produktanforderungen.

| Anforderung | Eingefrorene Tests |
| --- | --- |
| MSI-01 | `MSI-01 through MSI-05 applies only the final planned layout once when Add Spacer is false/true`; `MS-03 and MSI-01 complete optimization only after the user triggers Magic Sort` |
| MSI-02 | `MSI-01 through MSI-05 applies only the final planned layout once when Add Spacer is false/true`; `MS-05 and MSI-02 lower the layout cost by applying only the completed improvement` |
| MSI-03 | `MSI-01 through MSI-05 applies only the final planned layout once when Add Spacer is false/true` prüft einen einzigen Übergabeaufruf mit vollständigen Suite-, Bug- und Spacer-Daten. |
| MSI-04 | `MSI-01 through MSI-05 applies only the final planned layout once when Add Spacer is false/true`; `MSI-04 applies filtered and collapsed-suite inputs immediately with Add Spacer` |
| MSI-05 | `MSI-01 through MSI-05 applies only the final planned layout once when Add Spacer is false/true` vergleicht die Übergabe mit dem letzten Schritt des unveränderten Planers; `MS-05 returns the same result for identical inputs` prüft Determinismus. |
| MSI-06 | `MSI-06 and MSI-08 shows only a short confirmation after the completed layout`; `MSI-06 replaces running progress with immediate confirmation`; `MSI-06 clears the short confirmation automatically` |
| MSI-07 | `MSI-07 and MSI-09 persists only the final result and leaves no delayed layout write`; `MS-07 persists and restores both optimized orders for the active set` |
| MSI-08 | `MSI-08 confirms a click without writing when the layout is already final`; `MSI-08 announces completion immediately and does not enter a running status`; Tests für normalen und reduzierten Bewegungsmodus im Feedback-Gate. |
| MSI-09 | `MSI-07 and MSI-09 persists only the final result and leaves no delayed layout write`; die drei aktualisierten Regressionen zu späteren Eingabe-, Set- und manuellen Layoutänderungen in `magic-sort-filter-stability.spec.tsx`. |

## Rotes Gate vor der Umsetzung

Der Testlauf kompiliert und startet vollständig. Auf dem freigegebenen Produktstand schlagen zwölf Tests durch fachliche Assertions fehl, weil Magic Sort noch den laufenden Zustand setzt, den Button deaktiviert und Zwischenlayouts zeitversetzt anwendet. Setup, Imports und Test-Harness sind erfolgreich; die übrigen zwanzig Tests bestehen.

Die aktualisierten Tests ersetzen nur die durch den neuen Vertrag ausdrücklich aufgehobenen Erwartungen an schrittweise Layoutänderungen und laufendes Fortschrittsfeedback. Alle übrigen bestehenden Magic-Sort-Anforderungen bleiben geprüft.
