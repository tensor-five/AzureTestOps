import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixColumn, MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import type { MatrixRow } from './matrix-presentation.js';
import { createMatrixColumnHierarchy } from '../../domain/release-matrix/matrix-column-hierarchy.js';

type Suite = MatrixSnapshot['suites'][number];
type CaseContext = Pick<MatrixRow, 'content' | 'workItemId'>;
export const combinedMappingKey = (row: CaseContext, columnId: string): string => JSON.stringify([row.content, row.workItemId, columnId]);

/** Index physical memberships once; combining rows never changes a projection or test point. */
export function createCombinedSourceResolver(snapshot: MatrixSnapshot, config: MatrixConfig) {
    const hierarchy = createMatrixColumnHierarchy(snapshot.suites);
    const byHierarchy = new Map<string, Map<string, Suite[]>>();
    const members = new Set(snapshot.projections.map(projection => `${projection.suiteId}:${projection.workItemId}`));
    return (row: CaseContext, column: MatrixColumn) => {
        const shape = hierarchy(column);
        const version = snapshot.planId === config.planId ? shape.version : undefined;
        const key = `${column.versionSuiteId}:${column.hasEnvironmentLevel !== false}`;
        let indexed = byHierarchy.get(key);
        if (!indexed) {
            indexed = new Map();
            for (const {suite} of shape.contents) {
                const candidates = indexed.get(suite.name) ?? [];
                candidates.push(suite);
                indexed.set(suite.name, candidates);
            }
            byHierarchy.set(key, indexed);
        }
        const contents = version ? indexed.get(row.content) ?? [] : [];
        const candidates = contents.filter(suite => members.has(`${suite.id}:${row.workItemId}`));
        const explicit = config.combinedMappings?.[combinedMappingKey(row, column.id)];
        const suite = explicit ? candidates.find(candidate => candidate.id === explicit) : candidates.length === 1 ? candidates[0] : undefined;
        const ambiguous = !explicit && candidates.length > 1;
        const reason = !version ? 'Versions-Suite ist im aktiven Plan ungültig.' : suite ? ''
            : explicit ? `Gespeicherte ${column.hasEnvironmentLevel === false ? 'Suite-Auswahl' : 'Umgebungsauswahl'} ist ungültig. Bitte erneut auswählen.`
            : ambiguous ? `${column.hasEnvironmentLevel === false ? 'Suite' : 'Umgebung'} auswählen: Dieser Testfall kommt in mehreren Quellsuites dieser Version vor.`
            : contents.length ? 'Testfall ist in keiner passenden Inhaltssuite dieser Version enthalten.'
            : 'Inhaltliche Suite fehlt unter dieser Version.';
        return { suite, candidates, ambiguous, reason, missingMembership: !!version && contents.length > 0 && candidates.length === 0 && !explicit };
    };
}
