# Release-Matrix v3: Test-Traceability

Einzige fachliche Referenz ist der freigegebene [HTML-Vertrag v3](release-matrix.v3.html), Commit `b9ee770`, SHA-256 `9555894a8598f9da8e494949fbc765e7cc23f3ff25c402de94d9d42e42db6e14`. Diese Zuordnung und die technischen Testkonventionen erweitern den Vertrag nicht.

Status: Unabhängiges Test-Gate am 14. September 2026 freigegeben. Kein Produktcode ist Bestandteil dieser Testphase. Die 31 neuen Browser-Szenarien definieren das Ziel; sie sind gegen die bisherige v2-Implementierung teilweise rot. Die unveränderten v1/v2-Verträge, Tests, Harnesses und Manifeste bleiben historische eingefrorene Artefakte. In Playwright sind ausschließlich deren drei abgelöste Matrix-Vertragsspecs von der aktiven Auswahl ausgenommen. Andere E2E-Suiten bleiben aktiv.

## Abdeckung

H-Szenarien stehen in [release-matrix-v3.hierarchy.spec.ts](../../tests/e2e/release-matrix-v3.hierarchy.spec.ts), B-Szenarien in [release-matrix-v3.behavior.spec.ts](../../tests/e2e/release-matrix-v3.behavior.spec.ts).

| Vertrag | Szenarien | Beobachtbarer Nachweis |
| --- | --- | --- |
| RM3-01 – Versionsspalten | H01, H02, B02 | Überschrift aus aktuellem vollständigem Suite-Titel; Auswahl konkreter IDs, Sichtbarkeit und Spaltenreihenfolge; keine getrennten Eingaben für Name, Umgebung oder Tag. |
| RM3-02 – Stabile Identität | H02, H03, B02 | Umbenennung behält Auswahl und Quelle; gleiche Titel sind mit Pfad/ID auswählbar; aus dem Plan entfernte Version bleibt ungültig und nicht beschreibbar; IDs über Serverneustart erhalten. |
| RM3-03 – Direkter Quellpfad | H01, H04 (vier Varianten), H05, H07 | Quelle exakt unter gewählter Version über direkte Umgebung und direkten Inhalt; Abweichungen in Groß-/Kleinschreibung und Namenssuffixen werden nicht angenähert; zusätzliche Zwischenebenen werden nicht übersprungen; fremde Versionen sind keine Kandidaten. |
| RM3-04 – Eindeutige Zeile | H01, H04, B01 | Tupel Umgebung/Inhalt/Testfall über zwei Katalogversionen dedupliziert, verschiedene Umgebungen/Inhalte getrennt; ganze Planbasis und kleinere Versionsbasis; Zeilenidentität bleibt beim Gruppierungswechsel erhalten. |
| RM3-05 – Gruppierung | B01, B10, B11 | Umgebung mit Inhaltskontext bzw. Inhalt mit Umgebungskontext, unveränderte Quellen und Zeilenschlüssel; Modi haben getrennte Zustände. |
| RM3-06 – Katalogbasis | H01 | Vereinigung mehrerer Versionen im Katalog; nur ältere Katalogversion liefert Fall 303; außerhalb liegende ausgewählte Version liefert Ergebnisse, aber Fall 999 erst nach ausdrücklicher Erweiterung des Katalogs auf den ganzen Plan. |
| RM3-07 – Fehlend/mehrdeutig | H05, H06, H07 (zwei Varianten) | `?` bei fehlender Umgebung/Inhalt; `·` bei fehlender direkter Mitgliedschaft trotz Mitgliedschaft in einem Unterordner; mehrere Inhaltsknoten oder mehrere gleichnamige Umgebungen blockieren bis zur konkreten Inhalts-Suite-Auswahl, inklusive Pfad/ID, Persistenz und anschließendem Write auf genau diesen Punkt. |
| RM3-08 – Keine Runs | H08 | Leere Run-/Resultatantwort bei vorhandenen direkten Mitgliedschaften und einem Punkt erzeugt aktiv bedienbaren NotRun-Chip `—`, keinen fehlenden Quellpfad; anschließender manueller Run bestätigt. |
| RM3-09 – Ergebnislogik | H07, H08, B03–B07, B12 | Bestehende Aggregation nach abgeschlossenen Resultaten, Point-Fallback bei fehlender Resultat-Suite; bekannte/unbekannte Chips und Tooltip; Guards bei null/zwei Punkten; ein neuer manueller Run auf genau einem physischen Punkt; andere Version/Umgebung/Inhalt und frühere Resultate unverändert; Fehler vor/nach Run-Erzeugung ohne falsche Bestätigung. |
| RM3-10 – Filter | B01, B08, B09 | Suche über Titel/ID, exakter Testfall-Tag mit bestehender Case-Normalisierung und direkter Suite-Mitgliedschaft kombinierbar, Elternmitgliedschaft wird nicht abgeleitet; Spalten/Quellen bleiben gleich; Tag-Gruppierungseditor und Tags-Modus entfallen. |
| RM3-11 – Hierarchie laden | H09, H10 (zwei Varianten), H11 | Vollständiger Baum trotz ausschließlich parentloser flacher Suite-Antwort; Ladefehler und im Baum fehlender, im Katalog vorhandener Inhalt sind Fehler, keine leeren Filterergebnisse; kein Schreiben aus fehlgeschlagenem Read, gegebenenfalls veralteter Stand und Erholung nach erfolgreichem Read. |
| RM3-12 – Migration | B09 | Echte rohe v2-LowDB-Datei: Katalog/Suche/Filter/Set/Kontext und anderes Setlayout bleiben erhalten; Spalten, physische Tag-Mappings und freie Taggruppen/Zustände zurückgesetzt, Hinweis sichtbar; Nutzer wählt neue Version/Modus; zwei weitere Server-/Browserneustarts sanitizen idempotent ohne erneuten Verlust der v3-Auswahl. |
| RM3-13 – Persistenz/Bedienung | B02, B06, B09–B14, H07 | LowDB über Browser- und Serverneustart bei leerem LocalStorage; getrennte Reihenfolge/Einklappzustände pro Modus und Set, auch gleiche Namen; LocalStorage-Fallback bei fehlgeschlagenem Preferences-Read und LowDB-Vorrang nach Erholung; Tastatur, Touchziel/Tooltip nach Write, echte horizontale/vertikale Bewegung und sticky Zeilen-/Kopfkontext. |
| RM3-14 – Keine Suite-Tags | H12, H01, H05 | Widersprüchliche Tags auf allen Hierarchieebenen haben keine Wirkung; fehlgeschlagene reine Suite-Tag-Hydration verhindert Matrix nicht; Wechsel auf identische bzw. leere Tags ändert Quellen/Zeilen nicht; Writes ändern keine Tags und gehen ausschließlich an Runs/Results. |

H04 expandiert vier Namenvarianten; H07 expandiert zwei Mehrdeutigkeitsformen; H10 expandiert zwei Ladefehlerformen. Insgesamt ergeben sich **17 H-Szenarien und 14 B-Szenarien = 31**. Zusätzlich bleibt die nicht eingefrorene [Scrollregression](../../tests/e2e/release-matrix-scrolling.spec.ts) mit zwei Viewports (1280/390 px) aktiv und verwendet jetzt denselben v3-Harness; sie prüft insbesondere eine echte begrenzte vertikale Scrollfläche und beide positiven Scrollpositionen.

## Harness-Grenze und Testdaten

[server.ts](../../tests/e2e/release-matrix-v3/server.ts) startet den echten lokalen HTTP-Server, die echte Runtime/Adapter-Komposition, den gebündelten Browserclient und eine eigene temporäre LowDB-Datei. Vor einem Reset wird HTTP-Bereitschaft abgewartet. Rohes `seed`/`patch` schreibt nur Testpräferenzen und startet den lokalen Testserver neu; danach laden Tests die Seite erneut, damit sie dessen aktuellen CSRF-Token verwenden. Die v2-Migration wird nicht im Harness vorweggenommen.

[azure-fixture.ts](../../tests/e2e/release-matrix-v3/azure-fixture.ts) ersetzt ausschließlich die Azure-HTTP-Grenze. Katalog, Baum, direkte Mitgliedschaften, Punkte, Runs, Resultate und Work-Item-Hydration sind getrennte Antworten. Browser-Assertions nutzen die echte Produktlogik; es gibt keinen Testresolver für Matrixzellen. In B14 wird zusätzlich genau der Preferences-GET mit HTTP 503 unterbrochen, um den vorhandenen Browser-Fallback unter einem echten Transportfehler auszulösen; erfolgreiche Preferences-Antworten werden nicht simuliert.

Die feste Ausgangshierarchie enthält:

- `Plan / Katalog / 2.1.0 / TST|ACC|PRD / Regression|Data Import`, mit eigenen Suite-IDs und direkten Punkten je Vorkommen.
- `Plan / Katalog / 2.0.0 / TST / Regression`, mit zusätzlichem Katalogfall ohne Resultat.
- `Plan / 2.2.0 / TST|ACC / Regression|Data Import`, außerhalb der Katalogbasis, sowie eine weitere ungewählte Version mit denselben fachlichen Namen.
- 13 logische Katalogzeilen, 14 bei gesamtem Plan. Testfälle wie 201 sind absichtlich in verschiedenen Umgebungen und Inhalten enthalten. Physische Suite-IDs und Punkt-IDs bleiben getrennt.
- Der flache Katalog kann alle Elternverweise auslassen, während der Tree-Endpunkt weiterhin eine vollständige gemeinsame Wurzel liefert. Der repräsentative Lauf weist dafür 23 Katalogeinträge/23 Kandidaten/23 fehlende flache Eltern und eine kanonische Wurzel aus.
- Breite Scrolltabellen erhalten wirklich verschiedene Versions-Suites, keine bloß unterschiedlich beschrifteten Kopien derselben Version. Work-Item-IDs der Testfälle überschneiden sich nicht mit Suite-IDs.

## Technische Kohärenz, keine zusätzliche Fachreferenz

Nur für Seed-Daten, UI-Lokatoren und spätere Umsetzung abgestimmt:

- Konfiguration `version: 3`; Spalten `{ id, versionSuiteId, visible }`.
- Gruppierung `environment` oder `content`; Zustand in `groupOrderByMode` und `collapsedByMode`, jeweils mit diesen zwei Schlüsseln.
- Zeilenattribut `data-matrix-row` enthält ein JSON-Tupel `[environment, content, caseId]`; Spaltenattribut enthält die lokale Spalten-ID. Explizite Quellen-Mappings verwenden `[environment, content, columnId]` als JSON-Schlüssel und die reale Inhalts-Suite-ID als Wert.
- Auswahlbeschriftungen `Versions-Suite N` und `Suite für Umgebung / Inhalt / Versionstitel` sind technische Locator-Konventionen. Die bestehenden Labels für Filter, Navigation, Gruppierung und Status bleiben verwendbar.
- Diese Bezeichner sind weder zusätzliche Nutzeranforderungen noch ein Produktgerüst. Produktcode, DTOs und Ports werden erst nach unabhängig bestandenem Test-Gate erstellt.

## Lokaler Nachweis vor Review

```sh
npm run typecheck
npx playwright test tests/e2e/release-matrix-v3 --list
npx playwright test tests/e2e/release-matrix-v3 --grep 'V3-H01|V3-H08|V3-H09|V3-B09'
node scripts/check-release-matrix-approval.mjs
```

Typecheck und Discovery booten ohne Produktänderungen. Der repräsentative Browserlauf endet mit vier erwarteten fehlgeschlagenen Assertions: v3-Migrationshinweis fehlt, Versionsüberschriften fehlen, dreiteiliger NotRun-Zeilenschlüssel fehlt, parentloser Katalog liefert nach alter v2-Zeilenlogik neun statt 13 Zeilen. Kein Compile-/Server-Setupfehler; Log `/tmp/matrix-v3-red.log`. Eine vollständige grüne v3-Ausführung ist erst das anschließende Implementierungsgate.
