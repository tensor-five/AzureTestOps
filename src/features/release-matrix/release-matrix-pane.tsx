import { MatrixTooltipProvider } from "./matrix-tooltip.js";
import * as React from 'react';
import { useClientPorts } from '../../app/composition/client-ports-context.js';
import { uniqueTags, type MatrixGrouping } from '../../domain/release-matrix/matrix-config.js';
import { catalogRows, matrixGroups, visibleVersionColumns } from './matrix-presentation.js';
import { useReleaseMatrix } from './use-release-matrix.js';
import { MatrixTable } from './matrix-table.js';
import { MatrixSettings } from './matrix-settings.js';
import './release-matrix.css';
export function ReleaseMatrixPane({ setId, planId, rootSuiteId, contextIdentity }: {
    setId: string;
    planId: number;
    rootSuiteId: number;
    contextIdentity?: string;
}) {
    const ports = useClientPorts();
    const model = useReleaseMatrix(setId, planId, rootSuiteId, ports.releaseMatrix, contextIdentity);
    const { config, snapshot, update } = model;
    const [settings, setSettings] = React.useState(false);
    const groups = snapshot ? matrixGroups(snapshot, config) : [];
    const columns = config.columns.filter(c => c.visible);
    const hasVersionSelection = snapshot ? visibleVersionColumns(snapshot, config).length > 0 : columns.some(column=>column.versionSuiteId>0);
    const hasRows = snapshot ? catalogRows(snapshot, config).length > 0 : false;
    const tags = snapshot ? uniqueTags(snapshot.projections.flatMap(p => p.tags)).sort((a, b) => a.localeCompare(b)) : [];
    if (config.tagFilter && !tags.includes(config.tagFilter))
        tags.push(config.tagFilter);

    return <MatrixTooltipProvider><section className="release-matrix-pane" aria-label="Release-Matrix Ansicht">
    <div className="matrix-toolbar"><div><h2>Release-Matrix</h2><p>Testfälle der ausgewählten Versionen im Vergleich</p></div><button type="button" onClick={() => setSettings(v => !v)} aria-expanded={settings}>Spalten &amp; Gruppierung</button><button type="button" disabled={model.loading || model.pending.size > 0} onClick={() => void model.reload()}>Matrix aktualisieren</button></div>
    {config.migratedFrom && <p className="matrix-migration-notice">Umstieg auf die Suite-Hierarchie: Alte tagbasierte Spalten, Suite-Zuordnungen und Gruppenzustände wurden zurückgesetzt. Bitte wähle einmalig die konkreten Versions-Suites und die Gruppierung nach Umgebung oder Inhalt. Suche und Filter bleiben erhalten.</p>}
    <div className="matrix-filters">
      <label>Gruppieren nach<select aria-label="Gruppieren nach" value={config.grouping} onChange={e => update({ grouping: e.target.value as MatrixGrouping })}><option value="environment">Umgebung</option><option value="content">Inhalt</option></select></label>
      <label>Testfall suchen<input aria-label="Testfall suchen" placeholder="ID oder Titel" value={config.search} onChange={e => update({ search: e.target.value })}/></label>
      <label>Tag<select aria-label="Tag" value={config.tagFilter} onChange={e => update({ tagFilter: e.target.value })}><option value="">Alle Tags</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label>In Testsuite<select aria-label="In Testsuite" value={config.suiteFilter} onChange={e => update({ suiteFilter: e.target.value })}><option value="">Alle Testsuites</option>{snapshot?.suites.map(s => <option key={s.id} value={s.id}>{s.path} (#{s.id})</option>)}</select></label>
      <button type="button" onClick={() => update({ search: '', tagFilter: '', suiteFilter: '' })}>Filter zurücksetzen</button>
    </div>
    {model.error && <div role="alert" className="matrix-error">{model.error}</div>}
    {model.pending.size > 0 && <div role="status">Neuer Durchlauf wird gespeichert …</div>}
    {model.status && <div role="status" className="matrix-success">{model.status}</div>}
    {model.loading && <div role="status">Matrix wird geladen …</div>}
    {settings && snapshot && <MatrixSettings snapshot={snapshot} config={config} update={update}/>}
    {!hasVersionSelection && <div className="matrix-empty">Versionsspalten auswählen: Öffne „Spalten &amp; Gruppierung“ und wähle mindestens eine gültige Versions-Suite zum Anzeigen.</div>}
    {snapshot && hasVersionSelection && !hasRows && <div className="matrix-empty">Keine direkt zugeordneten Testfälle unter Umgebung und Inhalt der ausgewählten Versionen.</div>}
    {snapshot && hasRows && !groups.length && <div className="matrix-empty">Keine Testfälle für diese Filter.</div>}
    {snapshot && columns.length > 0 && <MatrixTable
      snapshot={snapshot} config={config} groups={groups} pending={model.pending} blocked={model.blocked} stale={model.stale}
      update={update} record={model.record} onConfigure={() => setSettings(true)}
    />}
  </section></MatrixTooltipProvider>;
}
