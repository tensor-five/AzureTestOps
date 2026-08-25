# Magic Sort mit freien Bug-Höhenslots v1 – Traceability-Matrix

| Vertragsanforderung | Eingefrorener Test |
| --- | --- |
| MSS-01 | `MSS-01 renders the keyboard-operable Add Spacer checkbox beside Magic Sort` |
| MSS-02 | `MSS-02 defaults Add Spacer to disabled and preserves the enabled value in its set layout` |
| MSS-03 | `MSS-03 retains the dense Bug positions while Add Spacer is disabled` |
| MSS-04 | `MSS-04 through MSS-06 allocate distinct free Bug slots nearest to visible Test Case positions` |
| MSS-05 | `MSS-05 keeps crossings non-increasing while free slots reduce positional distance` |
| MSS-06 | `MSS-04 through MSS-06 allocate distinct free Bug slots nearest to visible Test Case positions`; `MSS-06 ignores collapsed Test Cases and keeps Test Case ids inside their own suite`; `MSS-06 preserves every Test Case in its suite when dense Magic Sort reorders visible cases` |
| MSS-07 | `MSS-01 renders the keyboard-operable Add Spacer checkbox beside Magic Sort`; `MSS-07 renders free slots without Bug cards and animates their vertical movement`; existing `MS-03 and MS-06 begin a live optimization only after the user triggers Magic Sort` |
