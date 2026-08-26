# Traceability-Matrix: Relations-Karten-Fokus v2

Vertrag: `docs/contracts/relation-card-focus.v2.html`
Prüfsumme: `a9b78936462c0127776662ea414195a18486523f2c4ae4530a460eb377c9fce6`

| Vertragsanforderung | Eingefrorene Prüfung | Nachweis |
| --- | --- | --- |
| RCF-01 | `src/features/relations-view/relation-card-focus.contract.spec.tsx` | Fokus-Schalter in jeder Test-Case-Karte unmittelbar vor dem rechten Related-Handle. |
| RCF-02 | `src/features/relations-view/relation-card-focus.contract.spec.tsx` | Fokus-Schalter in jeder Bug-Karte unmittelbar nach dem linken Related-Handle. |
| RCF-03 | `src/features/relations-view/relation-card-focus.contract.spec.tsx` | Eindeutige zugängliche Beschriftung und Aktivierung per Tastatur. |
| RCF-04 | `src/features/relations-view/relation-card-focus.contract.spec.tsx` | Direkte Gegenstücke und ihre Linien hervorgehoben; übrige Karten und Linien zurückgenommen. |
| RCF-05 | `src/features/relations-view/relation-card-focus.contract.spec.tsx` | Wiederholtes Aktivieren beendet den Kartenfokus. |
| RCF-06 | `src/features/relations-view/relation-card-focus.contract.spec.tsx` | Suite-Fokus, Related-Handles und Verschiebe-Handles unverändert nutzbar. |
| RCF-07 | `src/features/relations-view/relation-card-focus-conflict-color.contract.spec.tsx` | Eine fokussierte Statuskonflikt-Verbindung behält die explizite Konfliktmarkierung. |

Die Prüfungen bilden ausschließlich RCF-01 bis RCF-07 des freigegebenen Vertrags ab.
