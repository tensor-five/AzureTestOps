# AGENTS.md

## Verbindliche Design-Referenz

- Das visuelle Erscheinungsbild orientiert sich strikt an [`AzureGanttOps`](../AzureGanttOps/). Header, Footer, Farben, Schriftart und Schriftgrößen sind aus `src/app/bootstrap/local-ui-tokens.css` und `local-ui-shell.css` übernommen.
- Alle neuen UI-Klassen müssen in das bestehende Token-System passen (`var(--color-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--font-*)`).

## Verbindliche Persistenz-Referenz

- Nutzerbezogene lokale Einstellungen werden über `lowdb` persistiert (Datei: `~/.azure-testops/user-preferences.json`, API: `/phase2/user-preferences`).
- Referenzimplementierung: `src/adapters/persistence/settings/lowdb-user-preferences.adapter.ts`.
- `localStorage` ist nur Fallback/Kompatibilitätsschicht im UI, nicht die führende Persistenzquelle.

## Was wird in lowdb persistiert

- `themeMode` (system/light/dark)
- aktives Set + Set-Liste
- Layout pro Set (Item-Positionen, eingeklappte Suites, Filter)
- gespeicherte ADO-Kontexte (organization/project)

Keine Datenbank für rein flüchtige Laufzeitdaten (Polling-Zwischenstände, temporäre UI-Flags) — dafür In-Memory-State.

## Clean-Code-Prinzipien (verbindlich)

- Refactor-only bedeutet: kein geändertes Laufzeitverhalten ohne expliziten Feature-Auftrag.
- Kleine, klar benannte Module statt großer Sammeldateien.
- Eine Datei hat eine primäre Verantwortung.
- Logik nicht duplizieren; gemeinsame Logik in Utility/Service/Factory zentralisieren.
- UI-Orchestrierung und Fachlogik trennen: Komponenten koordinieren, Services berechnen.
- Persistenzzugriff kapseln (Store/Adapter), nicht ad hoc in beliebigen Komponenten.
- Jede nicht-triviale Änderung braucht passende Tests im betroffenen Bereich (Unit + ggf. Integration).
- Vor Abschluss `typecheck`, betroffene Tests und Cycle-Check ausführen; vollständiges `npm test` bei Features, größeren Refactors oder Risiko an gemeinsam genutzter Logik.

## Abhängigkeiten und Modulgrenzen

- Keine neuen Paketabhängigkeiten ohne kurze fachliche Begründung und Prüfung bestehender Alternativen im Projekt.
- Bestehende Utilities, Adapter, Stores und Token zuerst wiederverwenden; keine parallelen Sonderlösungen für denselben Zweck.
- Keine Cross-Feature-Imports, wenn die Logik fachlich in `src/shared/` gehört.
- Gemeinsame Logik erst extrahieren, wenn sie real geteilt wird oder eine Datei sonst mehrere Verantwortlichkeiten bekommt.

## Fehlerbehandlung und UX

- Adapter kapseln technische Fehler und geben domänentaugliche Fehler/Resultate an die Anwendung weiter.
- UI zeigt verständliche Fehlermeldungen und schluckt Fehler nicht still.
- Temporäre Runtime-Zustände bleiben im Speicher; persistiert wird nur bewusst modellierter Nutzerzustand.

## Accessibility

- Bestehende ARIA-Labels, Tastatur-Flows und Fokusverhalten stabil halten.
- Neue interaktive Elemente müssen per Tastatur erreichbar und bedienbar sein.
- Status oder Bedeutung nie ausschließlich über Farbe vermitteln.

## Architektur-Landkarte (Wo finde ich was?)

- `src/features/relations-view/`
  - Zwei-Spalten-View, Suite-Tree, Item-Drag, Linien-Layer.
  - Hauptorchestrator: `relations-pane.tsx` (analog `timeline-pane.tsx` aus AzureGanttOps).
  - State-Hooks: `use-item-positioning.ts`, `use-line-drawing.ts`, `use-suite-collapse.ts`.
- `src/features/set-management/`
  - Set CRUD Dialog + Header-Dropdown.
- `src/features/filters/`
  - Filter-Bar pro Spalte, pure Filter-Funktionen.
- `src/app/bootstrap/`
  - App-Start, HTTP-Server, UI-Client-Composition.
  - `ui-client.tsx` bleibt Kompositionsebene; Workflow-/Berechnungslogik in dedizierte Module.
- `src/shared/user-preferences/`
  - Preferences-Modelle/Sanitizing/Clientzugriff.
- `src/adapters/persistence/settings/`
  - LowDB-Adapter als führende Persistenzimplementierung.
- `src/adapters/azure-devops/test-management/`
  - Test-Management-Adapter mit retry/backoff; REST-Details siehe `docs/runbook/azure-devops-api.md`.
- `src/adapters/azure-devops/work-items/`
  - Hydration-Adapter + Relations-PATCH-Adapter; REST-Details siehe `docs/runbook/azure-devops-api.md`.

## Verbindliche Umsetzungsmuster

### 1) RelationsPane und Item-Interaktionen

- `relations-pane.tsx` nur als Orchestrator weiterentwickeln.
- Neue komplexe State-Blöcke zuerst als Hook unter `src/features/relations-view/` anlegen.
- Hook-Namen nach Domäne wählen (`use-item-dragging`, `use-line-drawing`, `use-suite-collapse`).
- Bestehende Props, ARIA-Labels und UX-Flows stabil halten.

### 2) Preferences

- Für neue/angepasste Preferences immer `createUserPreferenceStore<T>` nutzen (analog AzureGanttOps).
- `sanitize` und `buildPatch` sind Pflicht.
- `localStorage` nur als Fallback.

### 3) UI-Client Entkopplung

- `ui-client.tsx` darf koordinieren, aber keine wachsende fachliche Detail-Logik aufnehmen.
- Header-/Set-Workflow, Runtime-Enrichment, Transformationslogik in Services/State-Container.

### 4) Naming

- Hook-Namen folgen der Domäne und Aktion (`use-item-dragging`, `use-line-drawing`, `use-suite-collapse`).
- Services, Stores und Adapter nach fachlicher Aufgabe benennen, nicht nach technischer Bequemlichkeit.
- Keine generischen Sammelnamen wie `helpers.ts` oder `utils.ts`, sobald die Datei mehr als eine klar abgegrenzte Verantwortung hätte.

## Testkonventionen

- Für neue `.spec.ts` mit DOM-Zugriff: `// @vitest-environment jsdom` setzen.
- Jede ausgelagerte Utility/Service-Datei bekommt eigene Unit-Tests.
- Bei Refactors immer relevante `relations-pane` Regressionen mitlaufen lassen.
- Testnamen beschreiben Verhalten, nicht Implementierungsdetails.
- Testdaten sprechend benennen und wiederverwendbare Fixtures zentral halten.
- Große Inline-Testobjekte vermeiden, wenn dieselbe Struktur in mehreren Tests gebraucht wird.

## Azure CLI Zugriff (Test Management & Work Items)

Voraussetzung: Nutzer ist lokal via `az login` angemeldet, hat die `azure-devops` Extension installiert, und Defaults sind gesetzt:

```bash
az devops configure --defaults organization=https://dev.azure.com/<org> project=<project>
```

REST-Pfade und Aggregationsdetails stehen im Runbook: `docs/runbook/azure-devops-api.md`.

## Guardrails gegen zukünftiges Chaos

- Keine Datei gleichzeitig für mehrere große Refactoring-Pakete verwenden.
- Keine stillen Strukturbrüche: bei größeren Schnitten Doku im `docs/runbook/` aktualisieren.
- Keine Abkürzungen per Workaround, wenn Paketabhängigkeiten blockieren: stoppen und Blocker dokumentieren.
- Wenn unklar ist, wo neue Logik hingehört: zuerst in kleiner Utility/Hook kapseln, dann integrieren.

## Feature Implementation Checklist (bei jedem Feature verpflichtend)

- Scope und Zielverhalten schriftlich klären; Umfang der Checkliste der Änderung angemessen anwenden.
- Zuständigkeit festlegen: In welches Modul gehört die Logik?
- Bestehende Patterns wiederverwenden — keine parallelen Sonderlösungen.
- Persistenz prüfen: `lowdb` als führende Quelle, `localStorage` Fallback.
- UI/UX-Konformität gegen Tokens prüfen.
- Tests ergänzen: Unit + Regression.
- Qualitätsgates vor Abschluss: `npm run typecheck`, `npm run check:cycles`, betroffene Tests; `npm test` bei Features, größeren Refactors oder Risiko an gemeinsam genutzter Logik.
