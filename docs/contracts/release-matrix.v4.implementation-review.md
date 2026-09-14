# Release Matrix v4 – Implementierungsnachweis

Einzige fachliche Referenz ist der freigegebene v4-Vertrag einschließlich der darin weitergeltenden v3-Regeln. Dieser Nachweis erweitert den Vertrag nicht.

- Vertrag v4 SHA-256: `92184250ef76fe23744ab2c82ba78d663bcff20848e69c1b9820d22d9b3b31c3`
- Testmanifest v4 SHA-256: `822dca63d86a6c4014e4970fa9e5b2196aecf333af24799baeb1eaeb52c5ad07`
- Unabhängiges Test-Gate: freigegeben durch `review_v4_test_gate`.

## Umsetzung

Die sichtbaren gültigen Versions-Suites bestimmen die Zeilenbasis über ihre direkten Umgebungs- und Inhaltskinder. Der historische Matrix-Stammkatalog wird ignoriert; sein Auswahlfeld entfällt. Keine Versionsauswahl und ausgewählte Versionen ohne direkte Testfälle erhalten getrennte Hinweise. Die gespeicherte Konfigurationsstruktur, Matching-Ansicht, Outcome-Aggregator, Azure-Adapter und Schreiblogik bleiben unverändert. Drei Produktdateien wurden angepasst.

## Diagnoseabgleich

Die bereitgestellten Dateien bleiben ausschließlich im ignorierten lokalen Diagnoseordner. Die echte neue Präsentationsfunktion wurde gegen den gespeicherten Snapshot und die tatsächlichen Preferences ausgeführt:

- Ursprüngliche Rohdaten mit noch unterschiedlich benannten Inhalts-Suites: 128 Zeilen, ausschließlich TST, 36 fehlende Zellquellen aufgrund dieses Namensunterschieds.
- Nur im Speicher simulierte, vom Nutzer bestätigte Namensangleichung: 110 Zeilen, acht Inhaltsgruppen, ausschließlich TST, keine fehlenden Zellquellen.
- Unterschiedliche historische Katalog-IDs verändern die Menge nicht; ohne ausgewählte Version entstehen keine Zeilen.

Das ist eine Offline-Reproduktion. Die inzwischen in Azure vorgenommene Umbenennung wurde nicht erneut live abgefragt. Rohdaten, Kundentitel und Nutzereinstellungen sind nicht Bestandteil dieses Commits.

## Finale lokale Gates

- Typecheck, Build und Cycle-Check: grün; 198 Dateien, keine Zyklen.
- Approval-Checker: 27 eingefrorene Testmanifeste sowie Vertragsprüfungen grün.
- Unit-/Integrationtests: 149 Dateien, 844 Tests grün.
- Vollständige Browser-Regression: 71 Tests grün, darunter 44 v4-Szenarien.
- Coverage: Statements 87,16 %, Branches 78,90 %, Functions 87,19 %, Lines 87,64 %. Das konfigurierte 80-%-Gate für Statements, Functions und Lines ist erfüllt.
- Nativer `codex review` des vollständigen Diffs gegenüber origin/main einschließlich Produktänderungen: keine relevanten Findings. Vertrags-/Manifest-SHAs wurden unabhängig verifiziert.

Die erste Ausführung der vollständigen Unit-Suite wurde von der Sandbox bei lokalen Serverports blockiert (EPERM); die Wiederholung mit erlaubten lokalen Testservern bestand vollständig. Ein Sonar-Rating wurde lokal nicht gemessen. Remote-CI wird nach dem Push gesondert geprüft.
