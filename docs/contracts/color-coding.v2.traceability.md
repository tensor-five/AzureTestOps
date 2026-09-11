# Traceability: Color coding v2

Only `color-coding.v2.html`, verified by `color-coding.v2.sha256`, defines the approved v2 behavior. Selectors, English UI labels, fixture titles and the retained internal `bugs` preference key coordinate the tests and do not add product requirements.

| Requirement | Test coverage |
| --- | --- |
| CC2-01 | `color-coding.v2.contract.spec.ts`: independent Work Item list applies to Bug, Task, User Story, Feature, Epic and custom Risk cards; `color-coding.contract.spec.ts`: matching Task receives the right-hand rule |
| CC2-02 | v2 all-types test keeps the Test Case card unchanged; v1 separate-list and set-isolation tests retain independent lists |
| CC2-03 | v2 legacy-rule test seeds the existing `bugs` preference shape, reloads without localStorage and verifies non-Bug cards |
| CC2-04 | v2 all-types test verifies one flat rule row and no grouping, type-condition or Boolean controls; v1 simple-list test verifies append, edit, delete and first-match order |
| CC2-05 | v1 title-comparison tests cover contains, does-not-contain, starts-with, equals, literal and case-insensitive matching for both lists; v1 State/Tag tests cover whole-value equality and blank values |
| CC2-06 | v2 palette test requires a visible, non-focusable, accessible preview and compares its rail and fill with the matched card after every color change |
| CC2-07 | v2 palette test requires exactly the eight approved colors, eight distinct rails, matching preview/card paint and readable text in light and dark themes; preference unit test preserves all eight values |
| CC2-08 | v2 persistence test directly verifies the type and state chips, reorders a colored Feature by drag-and-drop and retains its color; v1 refresh/filter/focus/relation and readable-card tests retain search, focus, relation, ordering and text description |
| CC2-09 | v2 narrow test verifies both areas start collapsed and open independently; v1 toolbar test verifies icon-only placement directly beside the filter control |
| CC2-10 | v2 persistence test saves Teal through the production LowDB/HTTP harness, restores without localStorage and retains set isolation; v1 persistence tests cover deletion and save-error recovery |
| CC2-11 | v2 narrow test measures every rule control and preview inside 390 px and verifies the preview adds no tab stop; v1 keyboard test retains native keyboard operation for all controls |

## Harness and red gate

The existing browser harness mounts the production RelationsPane, HTTP preferences adapter and LowDB adapter. Its only v2 additions are additional Work Item types and a test-only method to seed the approved legacy preference shape. No product module, component, DTO, route or placeholder implementation is introduced during the test phase.

Before product implementation, TypeScript compilation succeeds. The new preference assertion fails because only the four v1 colors survive sanitizing. All five v2 browser tests boot with eight visible Work Item cards and fail at missing v2 UI or behavior. These are expected assertion/locator failures caused by the absent feature, not build or harness failures.
