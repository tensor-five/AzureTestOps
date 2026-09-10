# Magic Sort: sichtbares Layout und Diagnose

Magic Sort wird ausschließlich durch den Nutzer gestartet. Text- und Facettenfilter,
Ordnerzustände und die Add-Spacer-Option bestimmen den Eingabesnapshot. Eine Relation
zählt pro sichtbarem Test-Case-Vorkommen `(suiteId, testCaseId)`.

## Zuständigkeiten

- `magic-sort-model.ts`: DOM-unabhängige Eingabe-, Layout- und Plantypen.
- `magic-sort-geometry.ts`: Messadapter; reale Zentren und Slot-Schrittweite,
  auch für einen einzelnen sichtbaren Bug. Suite-Vorkommen werden getrennt gelesen.
- `magic-sort-metrics.ts`: gemeinsame Bewertung für Optimierung und Debug-Bericht.
- `magic-sort-spacer-optimizer.ts`: dynamische Programmierung für die minimale
  Gesamtabweichung einer festen Reihenfolge verbundener Bugs; unverbundene Bugs
  füllen freie Plätze unter Wahrung ihrer relativen Reihenfolge.
- `magic-sort-layout.ts`: vergleicht bestehende, kompakte und optimierte Kandidaten.
  Veröffentlichte Schritte verschlechtern weder Distanz noch Kreuzungszahl.
  Test Cases dürfen nur innerhalb ihrer Suite getauscht werden.
- `work-item-spacer-layout.ts`: Projektion des persistenten Tokenstacks auf sichtbare
  Slots und Rückübersetzung. Verborgene IDs bleiben erhalten und verbrauchen keinen
  sichtbaren Slot. Neu sichtbare IDs werden genau einmal ergänzt.
- `use-magic-sort.ts`: Ablauf und Animation. Filter-, Set-, Snapshot-, Resize- und
  manuelle Layoutänderungen verwerfen einen laufenden Plan. Eigene Schritte werden
  anhand ihrer erwarteten Layoutsignatur erkannt.

## Persistenz

Der Tokenstack bleibt Teil der bestehenden LowDB-Preferences pro Set.
Magic Sort übergibt ausschließlich sichtbare Slotpositionen an den Adapter.
Der Adapter übersetzt diese in den vollständigen Stack. Automatisches Sortieren
darf überflüssige Restslots entfernen; manuelle Bewegungen erhalten vorhandene
Spacer-Blöcke. Filterwechsel allein schreiben keine neue Anordnung.

## Debug-Bericht

Der Käfer öffnet die vorhandene Ausgabe. Ein Magic-Sort-Klick erfasst Ausgangslage,
geplante Slots, Distanz und Kreuzungen sowie den Abbruchgrund. Bei geöffneter Ausgabe
wird nach Anwendung zusätzlich die Darstellung gemessen. `observed.deviations`
zeigt Unterschiede zum Plan. Fehlende Messungen stehen auf `unavailable`, nicht auf
einem erfundenen Nullabstand. `summary.unit` kennzeichnet Pixel oder logische Slots.

## Regressionen

`magic-sort-filter-stability.spec.tsx` prüft die sieben freigegebenen Fehlerfälle.
`magic-sort-spacer-optimizer.spec.ts` vergleicht kleine Fälle mit vollständig
enumerierten Lösungen. Der Playwright-Test `magic-sort-filter-stability.spec.ts`
verwendet die echte RelationsPane mit Produktions-CSS und prüft Textfilter,
Spacer-Ausrichtung, Debug-Messung, Neuladen und das Aufheben von Filtern.
Der Workflow `Magic Sort regression` führt die relevanten Qualitätsgates und
Browserprüfungen bei betroffenen PRs und Integrations-Branch-Änderungen aus.
