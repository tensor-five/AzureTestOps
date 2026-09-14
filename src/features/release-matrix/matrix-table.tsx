import * as React from 'react';
import type { MatrixSnapshot, MatrixWrite } from '../../application/dto/release-matrix.dto.js';
import type { MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import { type MatrixGroup, resolveSource, mappingKey, matrixGroups, matrixRowKey } from './matrix-presentation.js';
import { MatrixCell } from './matrix-cell.js';
import { moveVisibleMatrixGroup } from './matrix-group-order.js';

type MatrixTableProps = {
  snapshot: MatrixSnapshot;
  config: MatrixConfig;
  groups: MatrixGroup[];
  pending: Set<string>;
  stale?: boolean;
  update(patch: Partial<MatrixConfig>): void;
  record(input: MatrixWrite): Promise<void>;
  onConfigure(): void;
};

export function MatrixTable({ snapshot, config, groups, pending, stale, update, record, onConfigure }: MatrixTableProps) {
  const columns = config.columns.filter(column => column.visible);
  const collapseField = config.grouping === 'tags' ? 'collapsedTags' : 'collapsed';
  const collapsedGroups = config[collapseField] ?? [];
  // Resolve once per suite/column, not once per cell in potentially large catalogs.
  const sources = React.useMemo(() => {
    const names = new Set(groups.flatMap(group => group.rows.map(row => row.groupName)));
    const result = new Map<string, ReturnType<typeof resolveSource>>();
    for (const name of names) {
      for (const column of config.columns) {
        result.set(mappingKey(name, column.id), resolveSource(snapshot, config, name, column));
      }
    }
    return result;
  }, [snapshot, config, groups]);
  const projections = React.useMemo(
    () => new Map(snapshot.projections.map(projection => [`${projection.suiteId}:${projection.workItemId}`, projection])),
    [snapshot]
  );
  const moveGroup = (index: number, direction: number) => {
    const allGroups = matrixGroups(snapshot, { ...config, search: '', tagFilter: '', suiteFilter: '' });
    const order = [...new Set([...config.groupOrder, ...allGroups.map(group => group.id)])];
    update({ groupOrder: moveVisibleMatrixGroup(order, groups.map(group => group.id), groups[index].id, direction) });
  };

  return (
    <div className="matrix-scroll" data-matrix-scroll="">
      <table aria-label="Release-Matrix">
        <colgroup>
          <col className="matrix-title-col" />
          {columns.map(column => <col key={column.id} className="matrix-status-col" />)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Testfall</th>
            {columns.map(column => (
              <th key={column.id} scope="col" title={column.tag}
                aria-label={`${column.name}${column.environment ? ' ' + column.environment : ''}`}>
                <span>{column.name}</span>{column.environment && <small>{column.environment}</small>}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group, index) => {
          const collapsed = collapsedGroups.includes(group.id);
          return (
            <tbody key={group.id}>
              <tr className="matrix-group-row" data-matrix-group={group.id}>
                <th colSpan={columns.length + 1} scope="rowgroup">
                  <div>
                    <button type="button" aria-expanded={!collapsed}
                      aria-label={`Gruppe ${group.name} ${collapsed ? 'aufklappen' : 'einklappen'}`}
                      onClick={() => update({ [collapseField]: collapsed
                        ? collapsedGroups.filter(id => id !== group.id)
                        : [...collapsedGroups, group.id] })}>
                      {collapsed ? '▸' : '▾'} {group.name} <span>({group.rows.length})</span>
                    </button>
                    {config.grouping === 'suites' && <>
                      <button type="button" aria-label={`Gruppe ${group.name} nach oben`}
                        disabled={index === 0} onClick={() => moveGroup(index, -1)}>↑</button>
                      <button type="button" aria-label={`Gruppe ${group.name} nach unten`}
                        disabled={index === groups.length - 1} onClick={() => moveGroup(index, 1)}>↓</button>
                    </>}
                  </div>
                </th>
              </tr>
              {!collapsed && group.rows.map(row => (
                <tr key={matrixRowKey(row)} data-matrix-row={matrixRowKey(row)}>
                  <th scope="row">
                    <span className="matrix-case-id">#{row.workItemId}</span> {row.title}
                    {config.grouping === 'tags' && <small>{row.groupName}</small>}
                  </th>
                  {columns.map(column => {
                    const source = sources.get(mappingKey(row.groupName, column.id))!;
                    const key = `${source.suite?.id}:${row.workItemId}`;
                    const projection = projections.get(key);
                    return (
                      <td key={column.id} data-matrix-column={column.id}>
                        <MatrixCell projection={projection} pointCount={snapshot.pointCounts[key] ?? 0}
                          pending={pending.has(key)} missingSuite={!source.suite} ambiguous={source.ambiguous} missingSuiteReason={source.reason}
                          sourceDescription={source.suite ? `${source.suite.path} · Suite #${source.suite.id} · Suite-Tag: ${column.tag.trim()}` : undefined}
                          readOnlyReason={stale ? 'Angezeigter Stand veraltet. Bitte die Matrix vor weiteren Änderungen aktualisieren.' : undefined}
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
