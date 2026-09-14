import * as React from 'react';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixConfig, MatrixColumn } from '../../domain/release-matrix/matrix-config.js';
import { catalogRows, resolveSource, mappingKey } from './matrix-presentation.js';
export function MatrixSettings({ snapshot, config, update }: {
    snapshot: MatrixSnapshot;
    config: MatrixConfig;
    update(patch: Partial<MatrixConfig>): void;
}) {
    const names = [...new Set(catalogRows(snapshot, config).map(row => row.groupName))].sort((a, b) => a.localeCompare(b));
    const change = (id: string, patch: Partial<MatrixColumn>) => update({ columns: config.columns.map(c => c.id === id ? { ...c, ...patch } : c) });
    const move = (index: number, direction: number) => { const columns = [...config.columns]; [columns[index], columns[index + direction]] = [columns[index + direction], columns[index]]; update({ columns }); };
    return <section className="matrix-settings" aria-label="Matrix konfigurieren">
    <label>Stammsuite<select aria-label="Stammsuite" value={config.catalogRootId} onChange={e => update({ catalogRootId: Number(e.target.value) })}>
      {snapshot.suites.filter(s => !s.suiteType || s.suiteType.toLowerCase().includes('static')).map(s => <option key={s.id} value={s.id}>{s.path} (#{s.id})</option>)}
    </select></label>
    <p>Der Suite-Tag steht direkt auf der jeweiligen Testsuite. Quellen mit gleichem fachlichem Namen werden im ganzen Plan ausgewählt.</p>
    <div className="matrix-column-settings">{config.columns.map((column, index) => <fieldset key={column.id}>
      <legend>Spalte {index + 1}</legend>
      <label>Name<input aria-label={`Spaltenname ${index + 1}`} value={column.name} onChange={e => change(column.id, { name: e.target.value })}/></label>
      <label>Umgebung<input aria-label={`Umgebung ${index + 1}`} value={column.environment} onChange={e => change(column.id, { environment: e.target.value })}/></label>
      <label>Suite-Tag<input aria-label={`Suite-Tag ${index + 1}`} value={column.tag} onChange={e => change(column.id, { tag: e.target.value })}/></label>
      <label><input type="checkbox" aria-label={`Spalte ${index + 1} anzeigen`} checked={column.visible} onChange={e => change(column.id, { visible: e.target.checked })}/>Anzeigen</label>
      <div><button type="button" aria-label={`Spalte ${index + 1} nach links`} disabled={index === 0} onClick={() => move(index, -1)}>←</button><button type="button" aria-label={`Spalte ${index + 1} nach rechts`} disabled={index === config.columns.length - 1} onClick={() => move(index, 1)}>→</button><button type="button" aria-label={`Spalte ${index + 1} entfernen`} onClick={() => update({ columns: config.columns.filter(c => c.id !== column.id) })}>Entfernen</button></div>
      {names.map(name => {
        const source = resolveSource(snapshot, config, name, column);
        const key = mappingKey(name, column.id), explicit = config.mappings[key];
        const describe = (suite: MatrixSnapshot['suites'][number]) => `${suite.path} (#${suite.id}) · Suite-Tag: ${column.tag.trim()}`;
        return <label key={name}>{name}<select aria-label={`Suite für ${name} / ${column.name}`} value={explicit ?? ''} onChange={e => {
            const mappings = { ...config.mappings };
            if (e.target.value) mappings[key] = Number(e.target.value); else delete mappings[key];
            update({ mappings });
        }}>
          <option value="">Automatisch · {source.suite && !explicit ? describe(source.suite) : source.ambiguous ? 'mehrdeutig' : source.reason || 'nach Name und Suite-Tag'}</option>
          {source.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{describe(candidate)}</option>)}
          {explicit && !source.candidates.some(candidate => candidate.id === explicit) && <option value={explicit}>{source.suite ? describe(source.suite) : `Suite #${explicit} · Zuordnung ungültig`}</option>}
        </select></label>;
      })}
    </fieldset>)}</div>
    <button type="button" onClick={() => update({ columns: [...config.columns, { id: crypto.randomUUID(), name: '', environment: '', tag: '', visible: true }] })}>Spalte hinzufügen</button>
  </section>;
}
