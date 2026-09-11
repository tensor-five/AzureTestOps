# Unabhängige Test-Gate-Freigabe

Freigegeben am 11. September 2026 durch den nur lesenden Codex-Subagenten `review_instant_sort_tests` vor der Produktimplementierung.

Einzige Anforderungsreferenz: `magic-sort-instant-apply.v1.html`, SHA-256 `85a82febcd8367e550f9c115b4ab2bfdb70dfd4172a702bf561a43b57f39d1fe`.

Ergebnis: MSI-01 bis MSI-09 sind vollständig zugeordnet und abgedeckt. Es bestehen keine zusätzlichen Produkterwartungen außerhalb des Vertrags. Die Änderungen an zuvor eingefrorenen Tests ersetzen ausschließlich die im neuen Vertrag ausdrücklich aufgehobenen Aussagen zu Zwischenschritten, laufendem Fortschritt und Sortieranimation; alle übrigen bestehenden Anforderungen bleiben erhalten.

Der korrigierte MSI-04-Test modelliert eine gefilterte sichtbare Teilmenge und eine eingeklappte Suite ausschließlich durch ihren sichtbaren Header. Alle vier Testdateien stimmen mit `magic-sort-instant-apply.v1.tests.json` überein.

Vor der Implementierung bestehen Vertragsintegrität, Testintegrität und TypeScript-Kompilierung. Das rote Gate startet vollständig und endet mit exakt zwölf fachlich fehlgeschlagenen sowie zwanzig bestandenen Tests, ohne Compile- oder Setupfehler.
