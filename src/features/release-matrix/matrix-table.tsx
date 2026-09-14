import * as React from 'react';
import type { MatrixSnapshot, MatrixWrite } from '../../application/dto/release-matrix.dto.js';
import type { MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import { type MatrixGroup, resolveSource, mappingKey, matrixGroups, matrixRowKey, versionTitle, effectiveMatrixGrouping } from './matrix-presentation.js';
import { combinedMappingKey, createCombinedSourceResolver } from './matrix-combined-sources.js';
import { MatrixSourcePicker } from './matrix-source-picker.js';
import { MatrixCell } from './matrix-cell.js';
import { moveVisibleMatrixGroup } from './matrix-group-order.js';
import { useMatrixTitleColumnResize } from './use-matrix-title-column-resize.js';

type MatrixTableProps = {
  snapshot: MatrixSnapshot;
  config: MatrixConfig;
  groups: MatrixGroup[];
  pending: Set<string>;
  blocked?: Set<string>;
  stale?: boolean;
  update(patch: Partial<MatrixConfig>): void;
  record(input: MatrixWrite): Promise<void>;
  onConfigure(): void;
};

export function MatrixTable({ snapshot, config, groups, pending, blocked, stale, update, record, onConfigure }: MatrixTableProps) {
  const columns = config.columns.filter(column => column.visible);
  const combined = config.separateEnvironments === false;
  const grouping = effectiveMatrixGrouping(config);
  const collapsedGroups = config.collapsedByMode[grouping];
  const sourceKey = combined ? combinedMappingKey : mappingKey;
  const titleColumn = useMatrixTitleColumnResize(config.testCaseColumnWidth, width => update({ testCaseColumnWidth: width }));
  const tableStyle = { '--matrix-title-column-width': `${titleColumn.width}px` } as React.CSSProperties;
  // Separate rows share suite contexts; combined rows additionally require concrete case membership.
  const sources = React.useMemo(() => {
    const contexts = new Map(groups.flatMap(group => group.rows.map(row => [sourceKey(row,''),row] as const)));
    const result = new Map<string, ReturnType<typeof resolveSource> & { missingMembership?: boolean }>();
    const resolveCombined = createCombinedSourceResolver(snapshot, config);
    for (const row of contexts.values()) {
      for (const column of config.columns) {
        result.set(sourceKey(row, column.id), combined ? resolveCombined(row, column) : resolveSource(snapshot, config, row, column));
      }
    }
    return result;
  }, [snapshot, config, groups, combined, sourceKey]);
  const projections = React.useMemo(
    () => new Map(snapshot.projections.map(projection => [`${projection.suiteId}:${projection.workItemId}`, projection])),
    [snapshot]
  );
  const moveGroup = (index: number, direction: number) => {
    const allGroups = matrixGroups(snapshot, { ...config, search: '', tagFilter: '', suiteFilter: '' });
    const order = [...new Set([...config.groupOrderByMode[grouping], ...allGroups.map(group => group.id)])];
    update({ groupOrderByMode: {...config.groupOrderByMode,[grouping]: moveVisibleMatrixGroup(order, groups.map(group => group.id), groups[index].id, direction)} });
  };

  return (
    <div className="matrix-scroll" data-matrix-scroll="">
      <table aria-label="Release-Matrix" style={tableStyle}>
        <colgroup>
          <col className="matrix-title-col" />
          {!combined && <col className="matrix-context-col" />}
          {columns.map(column => <col key={column.id} className="matrix-status-col" />)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="matrix-title-header" aria-label="Testfall">
              Testfall
              <span className="matrix-title-resize-handle" {...titleColumn.handleProps} />
            </th>
            {!combined && <th scope="col" className="matrix-context-cell">{grouping === 'environment' ? 'Inhalt' : 'Umgebung'}</th>}
            {columns.map(column => (
              <th key={column.id} scope="col" title={versionTitle(snapshot,column)}
                aria-label={versionTitle(snapshot,column)}>
                <span>{versionTitle(snapshot,column)}</span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group, index) => {
          const collapsed = collapsedGroups.includes(group.id);
          return (
            <tbody key={group.id}>
              <tr className="matrix-group-row" data-matrix-group={group.id}>
                <th colSpan={columns.length + (combined ? 1 : 2)} scope="rowgroup">
                  <div>
                    <button type="button" aria-expanded={!collapsed}
                      aria-label={`Gruppe ${group.name} ${collapsed ? 'aufklappen' : 'einklappen'}`}
                      onClick={() => update({ collapsedByMode: {...config.collapsedByMode,[grouping]: collapsed
                        ? collapsedGroups.filter(id => id !== group.id)
                        : [...collapsedGroups, group.id]} })}>
                      {collapsed ? '▸' : '▾'} {group.name} <span>({group.rows.length})</span>
                    </button>
                    <>
                      <button type="button" aria-label={`Gruppe ${group.name} nach oben`}
                        disabled={index === 0} onClick={() => moveGroup(index, -1)}>↑</button>
                      <button type="button" aria-label={`Gruppe ${group.name} nach unten`}
                        disabled={index === groups.length - 1} onClick={() => moveGroup(index, 1)}>↓</button>
                    </>
                  </div>
                </th>
              </tr>
              {!collapsed && group.rows.map(row => (
                <tr key={matrixRowKey(row)} data-matrix-row={matrixRowKey(row)}>
                  <th scope="row" className="matrix-case-title" title={`#${row.workItemId} ${row.title}`}>
                    <span className="matrix-case-id">#{row.workItemId}</span> {row.title}
                  </th>
                  {!combined && <td className="matrix-context-cell">{grouping === 'environment' ? row.content : row.environment}</td>}
                  {columns.map(column => {
                    const source = sources.get(sourceKey(row, column.id))!;
                    const key = `${source.suite?.id}:${row.workItemId}`;
                    const projection = projections.get(key);
                    return (
                      <td key={column.id} data-matrix-column={column.id}>
                        {combined && <MatrixSourcePicker snapshot={snapshot} config={config} row={row} column={column} source={source}
                          disabled={!!stale || source.candidates.some(suite => pending.has(`${suite.id}:${row.workItemId}`))} update={update} />}
                        <MatrixCell key={`${key}:${projection?.testPointId ?? ''}`} projection={projection} pointCount={snapshot.pointCounts[key] ?? 0}
                          pending={pending.has(key)} missingSuite={!source.suite && !source.missingMembership} ambiguous={source.ambiguous && !combined} missingSuiteReason={source.reason}
                          sourceDescription={source.suite ? `${source.suite.path} · Suite #${source.suite.id}` : undefined}
                          readOnlyReason={stale ? 'Angezeigter Stand veraltet. Bitte die Matrix vor weiteren Änderungen aktualisieren.' : blocked?.has(key) ? 'Die letzte Statusänderung ist nicht bestätigt. Bitte Azure prüfen und die Ansicht aktualisieren.' : undefined}
                          onConfigure={onConfigure}
                          onChange={outcome => {
                            if (projection?.testPointId) void record({
                              contextIdentity: snapshot.contextIdentity, planId: snapshot.planId, suiteId: projection.suiteId,
                              workItemId: projection.workItemId, pointId: projection.testPointId, outcome
                            });
                          }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
