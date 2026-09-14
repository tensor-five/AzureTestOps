# Release-Matrix v2 – Testzuordnung

Status: Unabhängiges Test-Gate am 14. September 2026 freigegeben. Diese Zuordnung ist kein eigener Vertrag und definiert keine zusätzlichen fachlichen Anforderungen.

Einzige fachliche Referenz: [freigegebener Vertrag v2](release-matrix.v2.html), SHA-256 `1ec76cfba36147cee4d480ebcb53a0342666aaa339f2092f4437266bd2221d1a`.

## Testdateien und Grenze des Harness

- `V2-C01` bis `V2-C22`: [release-matrix-v2.contract.spec.ts](../../tests/e2e/release-matrix-v2.contract.spec.ts). Neue v2-Datei für das vollständige bestehende Bedien- und Schreibverhalten, mit logischen Namenszeilen und Suite-Tag-Quellen.
- `V2-S01` bis `V2-S16`: [release-matrix-v2.sources.spec.ts](../../tests/e2e/release-matrix-v2.sources.spec.ts). Vertiefte v2-Quellauswahl, Zeilenidentität, Fehlerfälle und Bestandsumstieg.
- [server.ts](../../tests/e2e/release-matrix-v2/server.ts) startet die echte Anwendung mit echtem HTTP-Server, Composition Root, Adaptern, Aggregator, LowDB und Browser-Bundle. Nur die externe Azure-HTTP-Grenze ist durch [azure-fixture.ts](../../tests/e2e/release-matrix-v2/azure-fixture.ts) ersetzt. Keine eigenen Ergebnis- oder Matchingalgorithmen im Harness.
- Alle Beispielwerte leben ausschließlich im Harness. Test-Suites werden im WIT-Endpunkt als `System.WorkItemType = Test Suite` mit eigenen `System.Tags` ausgegeben; Testfälle separat als `Test Case`. Die Tags auf Parent-Suites und die Query-Definition können bewusst irreführend sein. Memberships, Points und Run-/Result-Historie sind unabhängige Azure-Antworten. HTTP-Ausfälle, unvollständige Suite-Metadaten und falsche Work-Item-Typen sind als Testfälle steuerbar.
- Für die Migration wird ein tatsächlicher v1-Datenbestand direkt in eine temporäre LowDB-Datei geschrieben und die echte Runtime neu gestartet. Die alten Daten werden vor dem Anwendungseintritt nicht vom Test-Harness migriert oder durch den aktuellen Produktsanitizer normalisiert. Browser-Storage wird vor Wiederherstellung gelöscht.
- V1-Vertrag, V1-Tests und ihre Prüfsummen bleiben unverändert. `playwright.config.ts` nimmt ausschließlich die historische Datei `release-matrix.contract.spec.ts` aus der aktiven Discovery. Andere Suiten bleiben aktiv. Die neuen v2-Dateien bilden den aktiven fachlichen Matrix-Vertrag ab.

## Rein technische Testkonventionen

Die folgenden Bezeichner sind ausschließlich Locator-/Harness-Kohärenz und keine zusätzlichen Nutzeranforderungen. Der unabhängige Review prüft die Assertions gegen das freigegebene HTML, nicht diese Bezeichner:

- Konfigurationsversion: `version: 2`; vollständiger Spaltentag weiterhin `columns[].tag`.
- Logische Zeilen werden über `data-matrix-row = JSON.stringify([fachlicherName, testfallId])` gefunden; `data-matrix-column` bleibt die stabile Spalten-ID.
- V2-Zuordnungsschlüssel im vorbereiteten LowDB-Testbestand: `JSON.stringify([fachlicherName, spaltenId])`. Eine Zuordnung speichert die konkrete physische Suite-ID.
- Gruppenschlüssel für neue Namensgruppen sowie ihre Reihenfolge/Einklappzustände basieren auf dem vollständigen fachlichen Namen. V1 speichert demgegenüber physische Suite-IDs; die Tests prüfen, dass diese nicht unbemerkt als neue Namenszuordnung fortgelten.
- Bestehende zugängliche Bediennamen werden weiterverwendet; das bisherige Spaltenfeld heißt in v2 `Suite-Tag N`. Die Tests prüfen keine neue Route und fordern keine neuen Produkt-Skelette.

## Anforderungsmatrix

| Vertrag | Nachweis in E2E | Geprüftes Verhalten |
|---|---|---|
| RM-01 | C01, C16, C17 | Navigation mit aktiver Anzeige; Zuordnung und Anzahl ihrer Karten bleiben erhalten. Ein Set-Wechsel ändert keine Azure-Ziele; fremde Sets zeigen keine Bestätigung des alten Sets. Bestehende Layout-, Filter- und Kontextdaten bleiben erhalten. |
| RM-02 | C01, C04, C17 | Bestehende Navigation und Set-/Kontextfunktionen bleiben; Outcome-Stile werden gegen reale Zuordnungschips in Light und Dark verglichen. |
| RM-03 | S01, S02, S12, S16, C01, C12 | Stammsuite mit Unterbaum beziehungsweise ganzer Plan; einmalige Zeile pro exaktem Namen + Testfall-ID, verschiedene Namen bleiben getrennt. Ungetestete/außerhalb sichtbarer Releases liegende Katalogfälle bleiben; außerhalb des Katalogs liegende Fälle erzeugen keine zusätzlichen Zeilen. Exakte Namensgleichheit umfasst Groß-/Kleinschreibung. |
| RM-04 | C02, C13, S10 | Eigene geordnete Testfall-Tag-Liste hinzufügen/ersetzen/entfernen; doppelte Tags, leere Tags und Tags ohne Treffer erzeugen keine Zusatzgruppen. Restgruppe und mehrere Darstellungen einer logischen Zeile; fachlicher Gruppenname bleibt in Tagdarstellung erkennbar. Suite-Modus bleibt unbeeinflusst, Liste wird gespeichert. |
| RM-05 | S01, S08, S10, C01, C05, C06 | Ein Vergleich pro Name, mehrere Testfälle/Releases, unabhängige Regression-/Import-/Release-Punkte. Gleichnamige Suites mit anderen Tags sind kein Konflikt; eine gemeinsame physische Quelle mit mehreren Tags wird in ihren tatsächlich gleichen Anzeigen gemeinsam aktualisiert. |
| RM-06 | S01, C09, C12, C13, C20, S10 | Alphabetische Standardgruppen, Titel-/ID-Sortierung, manuelle Gruppen-/Spaltenreihenfolge und Collapse; eigene Tagreihenfolge. Wiederholte logische Zeilen bleiben identisch und erzeugen einen Write je konkretem Punkt. |
| RM-07 | S02, S03, S04, S05, S10, S15, C09, C17 | Planweite Quellen anhand exaktem Namen + vollständigem Suite-WIT-Tag, auch außerhalb des Katalogs; keine Release-Wurzel erforderlich. Trimmen/Case, keine Teilstrings, viele Namen pro Tag/mehrere Tags pro Suite. Case-/Parent-/Query-Tags sind keine Quellen. Leerer Tag ist unkonfiguriert. Spaltenname, Umgebung, Sichtbarkeit und Reihenfolge sind bedien-/speicherbar; kein fixes Format. |
| RM-08 | C01, C05, C12, S02 | Vorhandener Aggregator und Point-Fallback; Matrix stimmt mit derselben realen Suite-Projektion der Zuordnung überein. Historie und physische Ergebnisidentität bleiben erhalten. |
| RM-09 | C03, C11, C14, C18, C21, S04–S07, S13, S14 | Fehlende getaggte Suite versus fehlende direkte Mitgliedschaft versus NotRun; Erklärung per Hover/Fokus/Touch. Suite-, Tag-, Metadaten- und Membership-Fehler sind Fehler, keine leeren Treffer/Tags. Veraltet weiter angezeigte Werte bleiben gesperrt, erfolgreiche Aktualisierung stellt Bedienbarkeit her. |
| RM-10 | C03, C04, C14, C20 | Bestehende Chipfarben/-form/-maße in beiden Themes; Passed, Failed, Blocked, NotApplicable, NotRun und unbekanntes CustomOutcome mit originalem Volltext in Tooltip/zugänglichem Namen. |
| RM-11 | C05, C06, C20, C21, S08, S10 | Native Outcome-Auswahl mit vollständigen Optionen, Tastatur/Touch; adressiert genau die ausgewählte Suite-/Testfall-/Point-Identität. Explizit ausgewählte umbenannte Quelle bleibt Schreibziel. Gemeinsame Anzeigen eines Punkts aktualisieren sich, unabhängige Punkte bleiben unberührt. |
| RM-12 | C05, C07, C15, C16, S07, S10, S14 | Laufende Zellsperren, bestätigtes Lesen nach Schreiben, verständliche Schreib-/Bestätigungs-/Refreshfehler. Gemeinsame Anzeigen sind während Write gesperrt. Kein alter Wert wird als neuer bestätigter Outcome ausgegeben oder unbemerkt freigeschaltet. |
| RM-13 | C03, C14, C05 | Fehlender Point und mehrere Konfigurationen/Points bleiben mit Erklärung schreibgeschützt. Ein bisher ungetesteter Fall mit genau einem Point kann seinen ersten Run erhalten. |
| RM-14 | C05–C07, C15, C16, C20, S10 | Genau ein neuer manueller Run pro Punkt, erlaubte Ziel-Outcomes, keine NotRun-Rücksetzung. Frühere Historie unverändert, neuer Run/Result abgeschlossen mit korrekter Identität und späterem Datum; Bestätigung erst nach Rücklesen. Fehler nach Run-Erzeugung benennt den Run, stale history bestätigt keinen neuen Run, kein stiller Wiederholungs-Write. |
| RM-15 | C02, C09, C17, C19, S09, S11, S15 | LowDB-Wiederherstellung nach Neustart ohne LocalStorage; Matrixeinstellungen pro Set und keine persistierten Outcomes/Pending/Run-Daten. Echte v1-Migration erhält Darstellungsmodus, Stammsuite, Spalten-/Tag-/Filterwerte; alte Root-Einschränkung und physische Mappings entfallen mit Hinweis. Physische Gruppenreihenfolge/Collapse werden mit benanntem Reset neu initialisiert. V2-ID-Mappings bleiben eigenständig und werden bei Ungültigkeit nicht automatisch ersetzt. |
| RM-16 | C04, C11, C20–C22 | Kompakte Spalten und Chips, Umgebungsumbruch, kein Außenoverflow bei schmalem Viewport, Touch-Bedienfläche. Echte horizontale/vertikale Scrollbewegung und klebende Kontextköpfe; Tooltip im Viewport ohne Spaltenverbreiterung. Tastatur-Collapse/Outcome, leere Spaltenauswahl und leerer Katalog. |
| RM-17 | C01, C05, C17, S02, S04, S09, S10 | Keine Azure-Schreibvorgänge durch Quellenwahl/Filter/Navigation. Writes sind auf Run/Result und gewählten Point begrenzt; vorhandene Zuordnung, Tags und fachliche Historie bleiben. Nur vorhandene Suites im aktiven Plan liefern Quellen. |
| RM-18 | C08, C18, S04 | Direkte Testsuite-Mitgliedschaft und exakter case-insensitiver Testfall-Tag, UND-Verknüpfung; Parent-Suite liefert nicht indirekt die Membership ihrer Kinder. Filter ändern weder Spalten noch Quellen; fehlende Daten sind kein leerer Bestand. |
| RM-19 | C08, C18, C13, S01 | ID-/Titel-Substringsuche unabhängig von Case; Treffer bleiben in verschiedenen fachlichen Namensgruppen und ggf. mehreren Taggruppen sichtbar. Leere Gruppen ausgeblendet, Nulltreffer erklärt, Filterlöschung stellt Katalog wieder her. |
| RM-20 | S01–S03, S08, S09, S12, S16, C10, C19 | Nur exakte Name+Tag-Kandidaten im Plan; mehrfache Katalognamen und andere Tags blockieren nicht. Mehrfach gelieferte Datensätze derselben physischen Suite-ID erzeugen weder einen Konflikt noch zusätzliche Kandidatenoptionen oder logische Zeilen. Konflikte ohne Dropdown, explizite Auswahl mit vollständigem Pfad/ID/Tag. ID bleibt bei Umbenennung stabil, Entfernen/Tagentzug/Planverlassen erzeugen ungültige Zuordnung ohne automatische Ersatzsuite; kein Fuzzy-Matching. |

## Ausführung vor Produktentwicklung

`npm run typecheck` muss den Test-Harness ohne Produktgerüste kompilieren. Repräsentative neue Szenarien müssen die reale Anwendung booten und aufgrund fehlenden v2-Verhaltens durch Assertions fehlschlagen, nicht durch Import-, Compile-, Server-Setup- oder Fixture-Protokollfehler.

Beispiel: `npx playwright test tests/e2e/release-matrix-v2.sources.spec.ts --grep 'V2-S01|V2-S06|V2-S11'`.

Nach unabhängiger Validierung werden ausschließlich die freigegebenen neuen Testartefakte separat eingefroren. Bis dahin bleibt diese Testphase offen; Produktimplementierung und Änderungen eingefrorener v1-Dateien sind nicht Teil dieses Schritts.
