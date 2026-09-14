# Release-Matrix: Umgebungen zusammenfassen

„Umgebungen getrennt anzeigen“ ist standardmäßig eingeschaltet, auch bei bereits gespeicherten Einstellungen. Die bisherige Zeile je Umgebung, Inhaltssuite und Testfall bleibt dann unverändert.

Ausgeschaltet entsteht je Inhaltssuite und Testfall eine gemeinsame Zeile aus den sichtbaren Versionen. Die Anzeige gruppiert nach Inhalt; die zuvor gewählte Gruppierung nach Umgebung bleibt für das erneute Einschalten gespeichert. Gruppenreihenfolge und eingeklappte Gruppen verwenden weiterhin die bestehenden getrennten Zustände für Inhalt und Umgebung.

Eine Versionszelle berücksichtigt ausschließlich direkte Umgebungssuites unter ihrer gewählten Versionssuite sowie direkte, exakt gleichnamige Inhaltssuites darunter. Nur physische Quellsuites mit einer Projektion des konkreten Testfalls können das Ergebnis liefern. Eine einzige Quelle wird automatisch verwendet; bei mehreren Quellen muss die Quelle unmittelbar in der Zelle gewählt werden. Die Auswahl zeigt Umgebung, Pfad und Suite-ID. Status-Tooltips nennen den tatsächlichen physischen Pfad und die Suite-ID.

Die Quellwahl gilt für Inhalt, Testfall und Spalte. Eine gespeicherte Quelle, die nicht mehr passt, bleibt ungültig: Es gibt keinen stillen Wechsel auf eine andere Suite. Die Auswahl kann ausdrücklich gelöscht oder geändert werden. Fehlende Case-Mitgliedschaft in einer vorhandenen Inhaltssuite zeigt `·`, eine fehlende Suite oder ungeklärte Quelle `?`.

Die Einstellungen `separateEnvironments` und `combinedMappings` werden pro Set über den vorhandenen Preference-Store und lowdb gespeichert. Bestehende `mappings` für die getrennte Ansicht bleiben erhalten. Der Ansichtswechsel und die Quellwahl lösen keine Azure-Abfragen oder Statusschreibvorgänge aus.

Speichern und „Reset to active“ nutzen unverändert den physischen Testpunkt und den vorhandenen Mutationsablauf. Veraltete Daten, mehrere Testpunkte, laufende und unbestätigte Schreibvorgänge behalten ihre bestehenden Schutzregeln. Beim Wechsel der physischen Quelle wird eine noch nicht bestätigte Tastaturauswahl verworfen; Ergebnisse anderer Quellen werden nicht übernommen.
