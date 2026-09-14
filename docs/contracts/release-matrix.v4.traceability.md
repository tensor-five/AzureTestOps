# Release-Matrix v4: Test-Traceability

Einzige fachliche Referenzen sind der freigegebene [HTML-Vertrag v4](release-matrix.v4.html), SHA-256 `92184250ef76fe23744ab2c82ba78d663bcff20848e69c1b9820d22d9b3b31c3`, und der darin referenzierte [Vertrag v3](release-matrix.v3.html), SHA-256 `9555894a8598f9da8e494949fbc765e7cc23f3ff25c402de94d9d42e42db6e14`. V4 ersetzt RM3-06 und die zugehörige Katalogbedienung/Migration aus RM3-12/13. Diese Zuordnung ergänzt keine fachlichen Anforderungen.

Status: Testphase vor unabhängigem Review. Ausschließlich Tests, Testkonfiguration und diese Dokumentation wurden verändert; kein Produktcode. Die historischen eingefrorenen Artefakte bleiben unverändert.

## V4-Abdeckung

S-Szenarien stehen in [release-matrix-v4.selection.spec.ts](../../tests/e2e/release-matrix-v4.selection.spec.ts), H-Szenarien in [release-matrix-v4.hierarchy.spec.ts](../../tests/e2e/release-matrix-v4.hierarchy.spec.ts), B-Szenarien in [release-matrix-v4.behavior.spec.ts](../../tests/e2e/release-matrix-v4.behavior.spec.ts).

| Anforderung | Szenarien | Beobachtbarer Nachweis |
| --- | --- | --- |
| RM4-01 | H01, S02–S04 | Exakte Vereinigungsmenge aus ausgewählten sichtbaren gültigen Versionen. Ungewählte Version liefert keinen Fall 303; außerhalb des alten Katalogs ausgewählte Version liefert Fall 999. Alter Katalog kann Menge weder beschränken noch erweitern. Sichtbarkeit und Gültigkeit wirken auf Zeilen. |
| RM4-02 | S01, H05, H06 | Startpunkt ist ausgewählte Suite unabhängig von absoluter Baumtiefe. Nur direkte Umgebung, direkter Inhalt und dessen direkte Fälle. Fälle an Version/Umgebung sowie unter zusätzlichem Unterordner erscheinen nicht. Zusätzliche Ebenen werden nicht für Zellquellen übersprungen. |
| RM4-03 | H01, H04, B01 | Exakte Zeilenschlüssel Umgebung/Inhalt/Fall-ID, wiederholte direkte Mitgliedschaften dedupliziert; gleiche Fälle in anderen Umgebungen/Inhalten bleiben getrennt. Einseitige Fälle 203/999 bleiben enthalten. Vollständige Namen inklusive Groß-/Kleinschreibung werden nicht angenähert. |
| RM4-04 | S02, S03 (fünf Varianten), S04, B02 | Hinzufügen/Ändern/Ausblenden/Einblenden/Entfernen berechnet Menge neu. Umordnen verändert nur Spalten. Keine Spalten, nur ausgeblendete, ungewählte, fehlende oder planfremde Version: keine Zeilen, Auswahlhinweis. Ungültige gespeicherte Spalte bleibt erkennbar. Nach Refresh planfremde Version verliert ihre exklusiven Zeilen. |
| RM4-05 | S01, H01 | Archiv neben aktuellen Versionen erzeugt weder Archivfälle noch falsch abgeleitete Gruppen. Ausdrücklich ausgewählte gültige Archivversion funktioniert trotz zusätzlicher Ancestor-Ebene. Archivversion mit Fällen direkt unter Umgebung bleibt ohne Zeilen. |
| RM4-06 | H01, S05, B02, B09–B11, B14 | Stammsuite-Auswahl fehlt. Bestehende v3-Konfiguration erhält IDs/Reihenfolge/Sichtbarkeit, Gruppierung, Suche, Filter, manuelle Quellen, Gruppenreihenfolge/Einklappzustände. Alter/ungültiger Katalog wird ignoriert. LowDB-Neustart bei leerem LocalStorage; Set, Matching-Wurzel, Layout und Kontext bleiben unverändert. |
| RM4-07 | S06, S07, B03–B08, H06–H08 | Suche/Tag/Mitgliedschaft schränken Menge nur ein, Archivfälle werden auch durch passende Filter nicht hinzugefügt. Leere Run-Antwort bewahrt vorhandene Passed/Failed/Unspecified-Point-Outcomes, bekannte Chips und Tooltip. Fehlende Pfade/Mitgliedschaft und Mehrdeutigkeit behalten v3-Regeln. Physische Writes/Aggregation unverändert. |

## Weitergeltende V3-Abdeckung

| Anforderung | Szenarien | Beobachtbarer Nachweis |
| --- | --- | --- |
| RM3-01 | H01, H02, B02, S02 | Konkrete Versions-IDs, aktuelle vollständige Titel, Sichtbarkeit/Reihenfolge; keine separaten Tag-/Umgebungs-/Titelfelder. |
| RM3-02 | H02, H03, S03, S04, B02 | Titeländerung erhält ID, gleiche Titel sind durch Pfad/ID wählbar, ungültige Version bleibt erklärt und schreibgeschützt. |
| RM3-03 | H01, H04 (vier Varianten), H05, H07 | Direkte Kindpfade, vollständige exakte Namen, keine Zwischenebenen übersprungen, keine Quelle anderer Version. |
| RM3-04 | H01, H04, B01 | Deduplizierung nach Umgebung/Inhalt/Fall-ID; Unterscheidung anderer Umgebungen/Inhalte. |
| RM3-05 | B01, B10, B11 | Gruppierung Umgebung oder Inhalt mit jeweils anderem Zeilenkontext; Quellen/Zeilenidentität bleiben stabil. |
| RM3-06 | Ersetzt durch RM4-01 bis RM4-05 | Historische Katalogunion ist kein aktives Sollverhalten mehr. |
| RM3-07 | H05, H06, H07 (zwei Varianten) | `?` bei fehlendem Pfad, `·` bei fehlender direkter Mitgliedschaft; Mehrdeutigkeit blockiert bis zu physischer Quellenwahl mit Pfad/ID und LowDB-Persistenz. |
| RM3-08 | H08, S07 | NotRun-Dash bei Punkt ohne Outcome/Run; vorhandene Point-Outcomes werden entsprechend RM4-07 weiterhin angezeigt. |
| RM3-09 | H07, H08, B03–B07, B12, S07 | Abgeschlossene Runs und Point-Fallback, kompakte/custom Outcomes, Tooltip, 0/2-Punkt-Guards, genau ein manueller Run für den physischen Punkt, unveränderte andere Ergebnisse, Fehler vor/nach Run-Erzeugung ohne falschen Erfolg. |
| RM3-10 | B01, B08, S06 | Suche Titel/ID, exakte normalisierte Testfall-Tags, direkte Suite-Mitgliedschaft kombinierbar; Elternmitgliedschaft nicht abgeleitet, Spalten/Quellen unverändert. |
| RM3-11 | H09, H10 (zwei Varianten), H11 | Voller Baum trotz parentloser flacher Antwort; Ladefehler/unvollständiger Baum erzeugen Fehler, keine leeren Filterergebnisse; Writes gesperrt, Erholung bei erfolgreichem Read. |
| RM3-12 soweit weitergeltend | B09 | V2-Preferences verlieren nur abgelöste Tagspalten/-mappings/-gruppierungen mit sichtbarem Umstiegshinweis. Suche/Filter/Set/Kontext/Matching-Layout bleiben; neue Auswahl über zwei Neustarts idempotent. Katalogeditor entfällt gemäß RM4-06. |
| RM3-13 soweit weitergeltend | B02, B06, B09–B14, H07, S05, Scrollregression | LowDB pro Set, getrennte Gruppenmodi, Reihenfolge/Einklappen, Browserfallback und LowDB-Vorrang; Tastatur, Touch, Tooltip, sticky Kopf/Zeilenkontext und echte Bewegung in beiden Scrollrichtungen. |
| RM3-14 | H12 | Widersprüchliche, geänderte, fehlende oder nicht lesbare Suite-Tags beeinflussen Matrix nicht; Schreiben ändert keine Suite-Tags. |

H04 expandiert vier Namenvarianten, H07 zwei Mehrdeutigkeitsformen, H10 zwei Ladefehlerformen. **17 H + 14 B + 11 S + 2 Scrollszenarien = 44 Browser-Szenarien**. Die [v4-Scrollregression](../../tests/e2e/release-matrix-v4.scrolling.spec.ts) prüft 1280/390 px und verwendet zusätzliche direkte Fälle einer wirklich ausgewählten Inhalts-Suite.

## Unit-Regressionen

Die [Präsentationstests](../../src/features/release-matrix/matrix-presentation.spec.ts) prüfen zusätzlich ausgewählte/sichtbare/gültige Versionen, Vorwärtstraversierung mit direkter Tiefe, ignorierte alte Katalog-IDs und die bestehenden Quellen-/Gruppierungsregeln. Die [Konfigurationsinteraktionen](../../src/features/release-matrix/matrix-configuration-interactions.spec.tsx) behalten ihre bisherigen Erwartungen. Das mit v4 eingefrorene [Unit-Harness](../../tests/fixtures/matrix-hierarchy.ts) wählt jetzt explizit beide Versionen aus, deren Zeilen die bestehenden Gruppierungsregressionen benötigen. Das definiert keine automatische Produktauswahl.

## Testgrenze und aktives Wiring

Der unveränderte eingefrorene [v3-Server](../../tests/e2e/release-matrix-v3/server.ts) startet echte Runtime, Adapter, HTTP-Routen, gebündeltes UI und temporäre LowDB. Ausschließlich die [Azure-HTTP-Grenze](../../tests/e2e/release-matrix-v3/azure-fixture.ts) wird durch Testantworten ersetzt. Zusätzliche Testdaten entstehen ausschließlich in Specs/Fixtures, niemals aus den privaten Rohdaten. Keine Testimplementierung berechnet Produktzeilen oder Ergebnisse für Browser-Antworten.

[playwright.v4.config.ts](../../playwright.v4.config.ts) importiert die unveränderte historische Playwright-Konfiguration und ersetzt nur die Auswahl der abgelösten Matrix-Specs durch v4. Andere E2E-Suiten bleiben aktiv. `npm run test:e2e` nutzt diese Konfiguration. Der bestehende Release-Matrix-Workflow erhält lediglich den zusätzlichen Konfigurationspfad im Pfadfilter; PR-/Integrationsbranch-Auslöser und Concurrency bleiben erhalten.

## Validierung vor Implementierung

`npm run typecheck` und `npm run test:e2e -- tests/e2e/release-matrix-v4 --list` sind erfolgreich; 44 Browser-Szenarien entdeckt. Die erste Browserausführung in der Sandbox wurde durch den gesperrten lokalen Listen-Port verhindert. Die Wiederholung mit erlaubtem lokalem Testserver bootet; H01 scheitert wie erwartet an der Zeilen-Assertion (Archivfall 303 statt ausgewähltem Fall 999). Ein unabhängiger isolierter Lauf bestätigt denselben Assertion-Fehler und S07 (Point-Outcomes bei leerer Run-Liste) grün. Der ergänzende Browserlauf wurde nach ausreichendem Red-Nachweis beendet (siehe Abschluss unten). Laufprotokoll: `/tmp/matrix-v4-test-red.log`. Die Unit-Regressionen booten und liefern **3 erwartete fehlgeschlagene Assertions, 15 bestehende grüne Tests**; Protokoll `/tmp/matrix-v4-unit-red.log`. Keine Produktänderung wird zum Erreichen eines grünen Test-Setups vorgenommen.

Abschließender Red-Nachweis: Typecheck und Discovery grün; Unit-Regressionen 15 grün / 3 erwartete Assertionfehler. Browserlauf nach ausreichendem Red-Nachweis beendet: 28 grün / 11 erwartete Assertionfehler, ein laufendes Szenario unterbrochen und vier nicht gestartet. Unabhängiger Reviewer bestätigte H01 assertion-rot und S07 grün, anschließend vollständige Traceability freigegeben.
