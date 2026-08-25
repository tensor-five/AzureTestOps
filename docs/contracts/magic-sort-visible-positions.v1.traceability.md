# Magic Sort nach sichtbaren Positionen v1 – Traceability-Matrix

| Vertragsanforderung | Eingefrorener Test |
| --- | --- |
| MSV-01 | `MSV-01 and MSV-02 exclude Test Cases inside a collapsed suite from the layout cost`; `MSV-01 ignores a filtered Test Case and preserves the remaining visible layout`; `MSV-01 ignores a filtered Bug and preserves its stored position` |
| MSV-02 | `MSV-02 through MSV-05 count suite headers as rows and keep an equally good layout unchanged`; `MSV-01 and MSV-02 exclude Test Cases inside a collapsed suite from the layout cost` |
| MSV-03 | `MSV-02 through MSV-05 count suite headers as rows and keep an equally good layout unchanged` |
| MSV-04 | `MSV-02 through MSV-05 count suite headers as rows and keep an equally good layout unchanged`; `MSV-04 reduces crossings using the same visible positions that include suite headers` |
| MSV-05 | `MSV-02 through MSV-05 count suite headers as rows and keep an equally good layout unchanged` |
| MSV-06 | `MS-04 keeps every test case in its own suite while Magic Sort improves the visible layout` from `magic-sort-layout.v1.tests.json` |
| MSV-07 | `MS-03 and MS-06 begin a live optimization only after the user triggers Magic Sort`; `MS-07 persists and restores both optimized orders for the active set` from `magic-sort-layout.v1.tests.json` |
