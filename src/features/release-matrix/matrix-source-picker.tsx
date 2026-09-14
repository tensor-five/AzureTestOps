import * as React from 'react';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixColumn, MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import { combinedMappingKey, type createCombinedSourceResolver } from './matrix-combined-sources.js';
import { versionTitle, type MatrixRow } from './matrix-presentation.js';

type Props = {
    snapshot: MatrixSnapshot;
    config: MatrixConfig;
    row: MatrixRow;
    column: MatrixColumn;
    source: Pick<ReturnType<ReturnType<typeof createCombinedSourceResolver>>, 'suite' | 'candidates'>;
    disabled: boolean;
    update(patch: Partial<MatrixConfig>): void;
};
/** Choosing provenance is a preference change; only MatrixCell can initiate a status write. */
export function MatrixSourcePicker({ snapshot, config, row, column, source, disabled, update }: Props) {
    const key = combinedMappingKey(row, column.id);
    const explicit = config.combinedMappings?.[key];
    if (source.candidates.length < 2 && !explicit) return null;
    const invalid = !!explicit && !source.candidates.some(suite => suite.id === explicit);
    return <select className="matrix-source-picker"
      aria-label={`Umgebung für ${row.content} / #${row.workItemId} / ${versionTitle(snapshot, column)}`}
      value={explicit ?? ''} disabled={disabled} onChange={event => {
          const combinedMappings = { ...config.combinedMappings };
          if (event.target.value) combinedMappings[key] = Number(event.target.value);
          else delete combinedMappings[key];
          update({ combinedMappings });
      }}>
      <option value="">{source.candidates.length > 1 ? 'Auswählen …' : 'Automatisch'}</option>
      {source.candidates.map(suite => <option key={suite.id} value={suite.id}>{snapshot.suites.find(environment => environment.id === suite.parentSuiteId)?.name} · {suite.path} (#{suite.id})</option>)}
      {invalid && <option value={explicit}>Suite #{explicit} · ungültig</option>}
    </select>;
}
