# Effiziente Ansichtsabfragen

Gemessen am 2026-09-14. Vorher: Commit `f6cc4f2`. Nachher: Änderungen dieses PRs. Reale Adapter und Use-Cases gegen einen ausschließlich im Test-Harness simulierten Azure-Transport; 15 ms Wartezeit je Azure-GET, drei Wiederholungen, Median der gemessenen Gesamtdauer. Keine Live-Azure-Messung und keine produktiven Writes.

## Ergebnis

| Suites | Runs | Ansicht | Requests vorher → nachher | Median vorher → nachher |
|---:|---:|---|---:|---:|
| 23 | 10 | Release Matrix | 60 → 30 | 129 → 98 ms |
| 23 | 10 | Zuordnung | 31 → 31 | 97 → 96 ms |
| 23 | 500 | Release Matrix | 550 → 520 | 1107 → 1072 ms |
| 23 | 500 | Zuordnung | 521 → 521 | 1078 → 1071 ms |
| 103 | 10 | Release Matrix | 220 → 30 | 291 → 98 ms |
| 103 | 10 | Zuordnung | 31 → 31 | 101 → 98 ms |
| 103 | 500 | Release Matrix | 710 → 520 | 1267 → 1073 ms |
| 103 | 500 | Zuordnung | 521 → 521 | 1067 → 1072 ms |

Die Matrix liest nur Cases und Points der direkten Inhalts-Suites unter den konfigurierten Versionen. Suite-Metadaten bleiben vollständig. Ausgeblendete, aber konfigurierte Spalten werden mitgeladen, damit bloßes Ein-/Ausblenden keine Abfrage auslöst. In der Messung bleiben die ausgewählten Inhalte konstant; zusätzliche Suites liegen außerhalb dieser Auswahl.

**Die volle Ergebnishistorie bleibt bei frischen Reads erhalten.** Der bisherige Aggregator wählt das neueste Suite/Testfall-Ergebnis anhand des Abschlussdatums; dieses kann von einem früheren physischen Testpunkt stammen. Nur aktuelle Point-Referenzen zu lesen wäre nicht äquivalent. Ein zunächst erprobter Fastpath wurde deshalb verworfen. Die Zuordnungsansicht hat weiterhin dieselbe Request-Anzahl; kleine Laufzeitunterschiede liegen überwiegend im Messrauschen. Historienreads laufen jetzt unabhängig von der Work-Item-Hydration; leere Auswahlen benötigen gar keine Historie.

## Weitere nachgewiesene Einsparungen

- Rückkehr zur Matrix innerhalb von 60 Sekunden: null zusätzliche Matrix-Reads. Explizites Aktualisieren liest immer neu. Cache nach Client, Set, Plan, Root, Azure-Kontext und normalisierter Versionsauswahl getrennt, maximal 16 Einträge; keine Persistenz. Bestätigte Statusänderungen werden aus dem vorhandenen Mutationsjournal auf gecachte Daten angewendet; unsichere Writes verhindern Cache-Wiederverwendung.
- Filter auf eine außerhalb der Auswahl liegende Suite: genau eine Membership-Abfrage, keine Point-/Run-/Result-Abfragen. Bereits geladene Mitgliedschaften verursachen keine zusätzliche Abfrage.
- Der vollständige Tagkatalog wird erst bei Fokus der Tag-Auswahl geladen: Suite-Katalog/Baum, direkte Mitgliedschaften, dann deduplizierte Tag-Hydration in maximal 200 IDs großen Paketen. Keine Ergebnisabfragen. Diese bedarfsabhängigen Kosten sind nicht im obigen initialen Matrix-Read enthalten.
- SSE-Verbindungsabbruch erreicht Azure-Fetch und Retry-Wartezeiten. Bereits gestartete Worker werden abgewickelt, weitere Seiten/Suites/Ergebnisse nicht gestartet. Der Integrationstest startet zwei unabhängige Reads, bricht beide ab und weist null nachfolgende Requests nach.

## Reproduzieren

```sh
node_modules/.bin/esbuild tests/performance/view-read-benchmark.ts --bundle --platform=node --format=esm --outfile=/tmp/view-read-after.mjs
VIEW_BENCHMARK_MODE=after node /tmp/view-read-after.mjs
```

Der Baseline-Bundle wurde vor Produktänderungen gebaut. Die Test-Fixture ist für die Vergleichsmessung identisch. Rohmessungen: [vorher](view-read-before.json), [nachher](view-read-after.json). Fachliche Sonderfälle (fehlende Punkte, mehrere Konfigurationen, veraltete Antworten, aktive Punkte und frühere Punkt-Ergebnisse) werden in den Regressionstests separat geprüft.
