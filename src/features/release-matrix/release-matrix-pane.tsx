import { MatrixTooltipProvider } from "./matrix-tooltip.js";
import * as React from 'react';
import { useClientPorts } from '../../app/composition/client-ports-context.js';
import { uniqueTags } from '../../domain/release-matrix/matrix-config.js';
import { catalogRows, matrixGroups } from './matrix-presentation.js';
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
    const [tagDraft, setTagDraft] = React.useState(config.tags.join('\n'));
    const groups = snapshot ? matrixGroups(snapshot, config) : [];
    const columns = config.columns.filter(c => c.visible);
    const tags = snapshot ? uniqueTags(snapshot.projections.flatMap(p => p.tags)).sort((a, b) => a.localeCompare(b)) : [];
    if (config.tagFilter && !tags.includes(config.tagFilter))
        tags.push(config.tagFilter);

    return <MatrixTooltipProvider><section className="release-matrix-pane" aria-label="Release-Matrix Ansicht">
    <div className="matrix-toolbar"><div><h2>Release-Matrix</h2><p>Testkatalog im Vergleich über Versionen und Umgebungen</p></div><button type="button" onClick={() => setSettings(v => !v)} aria-expanded={settings}>Spalten &amp; Gruppierung</button><button type="button" disabled={model.loading || model.pending.size > 0} onClick={() => void model.reload()}>Matrix aktualisieren</button></div>
    {config.migratedFrom === 1 && <p className="matrix-migration-notice">Umstieg auf Suite-Tags: Frühere Suite-Zuordnungen werden neu bestimmt; Release-Wurzeln schränken die Quellen nicht mehr ein. Gruppenreihenfolge und eingeklappte Gruppen wurden zurückgesetzt. Die erhaltenen Spaltentags müssen direkt auf den konkreten Suites stehen; Testfall-Tags genügen dafür nicht.</p>}
    <div className="matrix-filters">
      <label>Gruppieren nach<select aria-label="Gruppieren nach" value={config.grouping} onChange={e => update({ grouping: e.target.value as 'suites' | 'tags' })}><option value="suites">Suites</option><option value="tags">Tags</option></select></label>
      <label>Testfall suchen<input aria-label="Testfall suchen" placeholder="ID oder Titel" value={config.search} onChange={e => update({ search: e.target.value })}/></label>
      <label>Tag<select aria-label="Tag" value={config.tagFilter} onChange={e => update({ tagFilter: e.target.value })}><option value="">Alle Tags</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label>In Testsuite<select aria-label="In Testsuite" value={config.suiteFilter} onChange={e => update({ suiteFilter: e.target.value })}><option value="">Alle Testsuites</option>{snapshot?.suites.map(s => <option key={s.id} value={s.id}>{s.path} (#{s.id})</option>)}</select></label>
      <button type="button" onClick={() => update({ search: '', tagFilter: '', suiteFilter: '' })}>Filter zurücksetzen</button>
    </div>
    {config.grouping === 'tags' && <div className="matrix-tag-editor"><label>Gruppierungs-Tags<textarea aria-label="Gruppierungs-Tags" value={tagDraft} onChange={e => setTagDraft(e.target.value)} rows={3}/></label><button type="button" onClick={() => { const tags = uniqueTags(tagDraft.split('\n')); setTagDraft(tags.join('\n')); update({ tags }); }}>Tag-Liste anwenden</button><span>Ein Tag pro Zeile. Die Reihenfolge bestimmt die Gruppen.</span></div>}
    {model.error && <div role="alert" className="matrix-error">{model.error}</div>}
    {model.pending.size > 0 && <div role="status">Neuer Durchlauf wird gespeichert …</div>}
    {model.status && <div role="status" className="matrix-success">{model.status}</div>}
    {model.loading && <div role="status">Matrix wird geladen …</div>}
    {settings && snapshot && <MatrixSettings snapshot={snapshot} config={config} update={update}/>}
    {!columns.length && <div className="matrix-empty">Versionsspalten auswählen: Öffne „Spalten &amp; Gruppierung“ und trage die Suite-Tags ein.</div>}
    {snapshot && !catalogRows(snapshot, config).length && <div className="matrix-empty">Testkatalog ist leer. Wähle eine Stammsuite mit Testfällen.</div>}
    {snapshot && catalogRows(snapshot, config).length > 0 && !groups.length && <div className="matrix-empty">Keine Testfälle für diese Filter.</div>}
    {snapshot && columns.length > 0 && <MatrixTable
      snapshot={snapshot} config={config} groups={groups} pending={model.pending} stale={model.stale}
      update={update} record={model.record} onConfigure={() => setSettings(true)}
    />}
  </section></MatrixTooltipProvider>;
}
