import * as React from 'react';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixConfig, MatrixColumn } from '../../domain/release-matrix/matrix-config.js';
import { catalogRows, catalogSuiteLabels, resolveSource, mappingKey } from './matrix-presentation.js';
export function MatrixSettings({ snapshot, config, update }: {
    snapshot: MatrixSnapshot;
    config: MatrixConfig;
    update(patch: Partial<MatrixConfig>): void;
}) {
    const options = snapshot.suites.map(s => <option key={s.id} value={s.id}>{s.path} (#{s.id})</option>);
    const catalogIds = new Set(catalogRows(snapshot, config).map(p => p.suiteId));
    const labels = catalogSuiteLabels(snapshot, config);
    const change = (id: string, patch: Partial<MatrixColumn>) => update({ columns: config.columns.map(c => c.id === id ? { ...c, ...patch } : c) });
    const move = (index: number, direction: number) => { const columns = [...config.columns]; [columns[index], columns[index + direction]] = [columns[index + direction], columns[index]]; update({ columns }); };
    return <section className="matrix-settings" aria-label="Matrix konfigurieren">
    <label>Stammsuite<select aria-label="Stammsuite" value={config.catalogRootId} onChange={e => update({ catalogRootId: Number(e.target.value) })}>
      {snapshot.suites.filter(s => !s.suiteType || s.suiteType.toLowerCase().includes('static')).map(s => <option key={s.id} value={s.id}>{s.path} (#{s.id})</option>)}
    </select></label>
    <p>Spalten vergleichen Version und Umgebung. Gleiche Suite-Namen werden automatisch zugeordnet; eine explizite Auswahl bindet die tatsächliche Suite-ID.</p>
    <div className="matrix-column-settings">{config.columns.map((column, index) => <fieldset key={column.id}>
      <legend>Spalte {index + 1}</legend>
      <label>Name<input aria-label={`Spaltenname ${index + 1}`} value={column.name} onChange={e => change(column.id, { name: e.target.value })}/></label>
      <label>Umgebung<input aria-label={`Umgebung ${index + 1}`} value={column.environment} onChange={e => change(column.id, { environment: e.target.value })}/></label>
      <label>Versions-Tag<input aria-label={`Versions-Tag ${index + 1}`} value={column.tag} onChange={e => change(column.id, { tag: e.target.value })}/></label>
      <label>Release-Wurzel<select aria-label={`Release-Wurzel ${index + 1}`} value={column.rootSuiteId} onChange={e => change(column.id, { rootSuiteId: Number(e.target.value) })}><option value={0}>Suite auswählen</option>{options}</select></label>
      <label><input type="checkbox" aria-label={`Spalte ${index + 1} anzeigen`} checked={column.visible} onChange={e => change(column.id, { visible: e.target.checked })}/>Anzeigen</label>
      <div><button type="button" aria-label={`Spalte ${index + 1} nach links`} disabled={index === 0} onClick={() => move(index, -1)}>←</button><button type="button" aria-label={`Spalte ${index + 1} nach rechts`} disabled={index === config.columns.length - 1} onClick={() => move(index, 1)}>→</button><button type="button" aria-label={`Spalte ${index + 1} entfernen`} onClick={() => update({ columns: config.columns.filter(c => c.id !== column.id) })}>Entfernen</button></div>
      {snapshot.suites.filter(s => catalogIds.has(s.id)).map(s => {
                const source = resolveSource(snapshot, config, s.id, column);
                const label = labels.get(s.id) ?? s.name;
                return <label key={s.id}>{label}<select aria-label={`Suite für ${label} / ${column.name}`} value={config.mappings[mappingKey(s.id, column.id)] ?? ''} onChange={e => { const mappings = { ...config.mappings }; const key = mappingKey(s.id, column.id); if (e.target.value)
                    mappings[key] = Number(e.target.value);
                else
                    delete mappings[key]; update({ mappings }); }}>
        <option value="">Automatisch{source.ambiguous ? ' · mehrdeutig' : source.suite ? ' · ' + source.suite.path : ' · Suite fehlt'}</option>
        {source.candidates.map(c => <option key={c.id} value={c.id}>{c.path} (#{c.id})</option>)}
      </select></label>;
            })}
    </fieldset>)}</div>
    <button type="button" onClick={() => update({ columns: [...config.columns, { id: crypto.randomUUID(), name: '', environment: '', tag: '', rootSuiteId: 0, visible: true }] })}>Spalte hinzufügen</button>
  </section>;
}
