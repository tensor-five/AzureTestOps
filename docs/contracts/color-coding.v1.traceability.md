# Traceability: Color coding v1

Only `color-coding.v1.html`, verified by `color-coding.v1.sha256`, defines the approved behavior. Labels, selectors and preference property names used by tests are implementation coordination, not additional contract requirements.

| Requirement | Browser test(s) in `tests/e2e/color-coding.contract.spec.ts` |
| --- | --- |
| CC-01 | separate simple lists; lowdb round-trip |
| CC-02 | separate simple lists; keyboard input (native Tab traversal and select operations) |
| CC-03 | separate simple lists; State and whole-Tag comparisons (both columns) |
| CC-04 | all title comparisons and literal matching (both columns) |
| CC-05 | separate simple lists; all title comparisons (blank and whitespace values) |
| CC-06 | separate simple lists (first match, append, delete, no match) |
| CC-07 | readable rails and tints in both themes |
| CC-08 | icon-only controls align with filters and collapse independently |
| CC-09 | icon-only controls; lowdb round-trip (reload without localStorage) |
| CC-10 | icon-only controls (collapse retains color and values); lowdb round-trip |
| CC-11 | lowdb round-trip, set isolation and deletion; save failure and recovery |
| CC-12 | refresh, filters, focus and relations; separate simple lists (immediate edits) |
| CC-13 | readable rails and tints (status and text explanation); refresh, filters, focus and relations |
| CC-14 | icon-only controls (keyboard toggle and hidden controls); narrow column and keyboard input (native Tab traversal and select operations) |

## Harness

The test server creates and removes a temporary lowdb database, uses the production persistence adapter and HTTP preference adapter, and mounts the production RelationsPane with the existing preferences bootstrap and error surface. Only fixture data, isolated server wiring and refresh/set-switch controls belong to the harness. No implementation stubs or product scaffolding were introduced for the feature. Mutation calls are counted to verify color edits do not write ADO data.

## Phase evidence

Before product implementation the harness builds and boots. The first contract test fails at the assertion that the palette button is visible, because the feature is absent. This is the expected red gate, not a setup/import failure.

Domain unit tests in `src/domain/color-coding/color-rule.spec.ts` additionally cover CC-03, CC-04, CC-05 and CC-06 using only test-local types and dynamic loading until implementation. They fail inside test assertions before the feature exists, without requiring product scaffolding.
