# Release-Matrix: Umgebungen zusammenfassen

„Umgebungen getrennt anzeigen“ ist standardmäßig eingeschaltet, auch bei bereits gespeicherten Einstellungen. Die bisherige Zeile je Umgebung, Inhaltssuite und Testfall bleibt dann unverändert.

Ausgeschaltet entsteht je Inhaltssuite und Testfall eine gemeinsame Zeile aus den sichtbaren Versionen. Die Anzeige gruppiert nach Inhalt; die zuvor gewählte Gruppierung nach Umgebung bleibt für das erneute Einschalten gespeichert. Gruppenreihenfolge und eingeklappte Gruppen verwenden weiterhin die bestehenden getrennten Zustände für Inhalt und Umgebung.

Jede Spalte hat in „Matrix konfigurieren“ die Checkbox „Umgebungsebene vorhanden“. Sie ist standardmäßig aktiviert, auch bei bestehenden Einstellungen. Aktiviert gilt `Version → Umgebung → Inhaltssuite → Testfälle`; deaktiviert gilt `Version → Inhaltssuite → Testfälle`. Es werden jeweils nur direkte Unterordner auf der gewählten Ebene berücksichtigt. Die Einstellung wird unabhängig je Spalte gespeichert.

Spalten beider Strukturen können verglichen werden. In der getrennten Ansicht liefert eine Spalte ohne Umgebung ihren Status für jede passende Kombination aus Inhaltssuite und Testfall der vorhandenen Umgebungszeilen. Testfälle, die ausschließlich in Spalten ohne Umgebung vorkommen, erhalten eine eigene Zeile mit „Ohne Umgebung“. In der zusammengefassten Ansicht bleibt es bei einer Zeile je Inhaltssuite und Testfall.

Nur physische Quellsuites mit einer Projektion des konkreten Testfalls können in der zusammengefassten Ansicht das Ergebnis liefern. Eine einzige Quelle wird automatisch verwendet; bei mehreren Quellen muss die Quelle unmittelbar in der Zelle gewählt werden. Die Auswahl zeigt Umgebung (falls vorhanden), Pfad und Suite-ID. Status-Tooltips nennen den tatsächlichen physischen Pfad und die Suite-ID.

Die Quellwahl gilt für Inhalt, Testfall und Spalte. Eine gespeicherte Quelle, die nicht mehr passt, bleibt ungültig: Es gibt keinen stillen Wechsel auf eine andere Suite. Die Auswahl kann ausdrücklich gelöscht oder geändert werden. Fehlende Case-Mitgliedschaft in einer vorhandenen Inhaltssuite zeigt `·`, eine fehlende Suite oder ungeklärte Quelle `?`.

Die Einstellungen `separateEnvironments`, `combinedMappings` und `columns[].hasEnvironmentLevel` werden pro Set über den vorhandenen Preference-Store und lowdb gespeichert. Ein fehlendes `hasEnvironmentLevel` bedeutet `true`. Bestehende `mappings` für die getrennte Ansicht bleiben erhalten. Der Ansichtswechsel und die Quellwahl lösen keine Azure-Abfragen oder Statusschreibvorgänge aus. Eine Änderung der Umgebungsebene lädt hingegen die passenden Testfälle und Testpunkte erneut und verwendet keinen Snapshot der anderen Hierarchie. Der Lese-Endpunkt erhält dazu `versions` für Spalten mit und `flatVersions` für Spalten ohne Umgebungsebene (jeweils JSON-Arrays von Suite-IDs).

Speichern und „Reset to active“ nutzen unverändert den physischen Testpunkt und den vorhandenen Mutationsablauf. Veraltete Daten, mehrere Testpunkte, laufende und unbestätigte Schreibvorgänge behalten ihre bestehenden Schutzregeln. Beim Wechsel der physischen Quelle wird eine noch nicht bestätigte Tastaturauswahl verworfen; Ergebnisse anderer Quellen werden nicht übernommen.
