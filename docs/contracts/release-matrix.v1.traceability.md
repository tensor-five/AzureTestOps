# Release-Matrix v1 — Traceability

Prüfgrundlage: `release-matrix.v1.html`, SHA-256 `fa2a61688da96bc2f15a43e32f66dd87a4a520cd277a240523f86ac08fbfcb95`.
Die IDs der Testtitel in `tests/e2e/release-matrix.contract.spec.ts` verknüpfen die folgenden Anforderungen. Technische Selektoren und Transportdetails sind keine zusätzliche Vertragsreferenz.

| Anforderung | E2E-Testtitel / Verhalten |
|---|---|
| RM01 | preserves suite occurrences and existing navigation |
| RM02 | preserves suite occurrences; copies existing chips |
| RM03 | preserves suite occurrences (gesamter Katalog, getrennte Vorkommen, kein fremder Test) |
| RM04 | retains the editable ordered tag list and distinct sources |
| RM05 | preserves suite occurrences; writes a new isolated completed run |
| RM06 | retains the editable ordered tag list; persists catalog, release columns, mappings, group order and collapse |
| RM07 | persists catalog, release columns, mappings, group order and collapse |
| RM08 | preserves suite occurrences (realer Aggregator); writes a new isolated completed run |
| RM09 | distinguishes absence; handles failed loads and empty configuration |
| RM10 | copies existing chips and exposes full outcome; distinguishes unknown outcomes |
| RM11 | writes a new isolated completed run; offers completed outcomes and keeps tag copies coherent |
| RM12 | separates write failure and a created run with unconfirmed result; writes a new isolated completed run |
| RM13 | distinguishes ambiguous write targets |
| RM14 | writes a new isolated completed run; offers completed outcomes; separates write failure |
| RM15 | retains the editable ordered tag list; persists catalog, release columns, mappings, group order and collapse |
| RM16 | copies existing chips; handles empty configuration |
| RM17 | preserves existing navigation and no unrelated mutations; isolated new runs |
| RM18 | combines actual suite membership, exact tags and title search |
| RM19 | combines actual suite membership, exact tags and title search |
| RM20 | requires explicit selection for duplicate names and preserves IDs through rename |

Test-Harness: `tests/e2e/release-matrix/server.ts`, `tests/e2e/release-matrix/azure-fixture.ts`. Ausschließlich Azure HTTP ist Fake; Browser-Bundle, HTTP-Server, bestehende Adapter, Aggregator und LowDB sind echte Anwendungskomponenten. Kein Produktcode oder Produktskelett wurde für das Test-Gate hinzugefügt.

## Ergänzte Detailabdeckung nach unabhängigem Review

| Teilanforderungen | Zusätzlicher E2E-Testtitel |
|---|---|
| RM03/06/08: Deduplikation, keine Release-Mitgliedschaft, Alphabet/ID, Point-Fallback | reads the full catalog once per occurrence and retains existing point fallback |
| RM04/06: nicht passende Tags, Reihenfolge, Suite-Pfad, Wirkung nur im Tag-Modus | tag presentation preserves all suite paths and has no effect on suite mode |
| RM09/10/13: fehlender Punkt, mehrere Punkte, Erklärungen, unbekannter Outcome | explains noneditable targets and absent cells on hover, focus and tap |
| RM12/14: vollständig geschriebener, aber nicht bestätigter neuer Run, altes Read Model | rejects failed confirmation and stale history without silently creating another run |
| RM01/12/14: Sperre identischer Kopien, Set-Wechsel während Write | locks identical copies and isolates a pending write across a set switch |
| RM01/02/07/15: echte Runtime-Neuerzeugung, alle Filter, Wurzel, Spaltendaten, Scope-Isolation, fremde Preferences, keine Runtime-Daten | restores every matrix preference after runtime restart without altering other sets |
| RM18/19: exakte Tags ohne Beachtung der Großschreibung, ID/Titel, keine Nachfahren-Mitgliedschaft, Reset, fehlende Filterdaten | combines exact case-insensitive filters, excludes descendants and clears back to catalog |
| RM20: Kandidatenpfade/-IDs, kein fuzzy Match, entfernte explizite Suite | exposes candidate paths, avoids fuzzy matching and detects removed explicit suites |
| RM10/11/16: Keyboard-Auswahl, N/A/Blockiert/Passed/NotRun und zugängliche Namen | uses keyboard selection and exposes every compact status |
| RM09/16: Touch-Auswahl, fehlende Mitgliedschaft per Tap, 44px-Bedienflächen | touch targets and sticky matrix fit narrow and long screens |
| RM16: horizontal/vertikal fixierte Kontextköpfe, Umbruch, leerer Katalog | pins row and column context while scrolling many releases and rows, and handles empty catalogs |

RM11/RM14 prüfen zusätzlich tatsächliche POST-Payloads und die neue Result-Identität mit Plan/Testfall/Suite/Testpunkt/Run, Completed-Zustand und Abschlusszeit. Das alte Ergebnisarray bleibt unverändert.
