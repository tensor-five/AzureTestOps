import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixColumn, MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import type { MatrixRow } from './matrix-presentation.js';

type Suite = MatrixSnapshot['suites'][number];
type CaseContext = Pick<MatrixRow, 'content' | 'workItemId'>;
export const combinedMappingKey = (row: CaseContext, columnId: string): string => JSON.stringify([row.content, row.workItemId, columnId]);

/** Index physical memberships once; combining rows never changes a projection or test point. */
export function createCombinedSourceResolver(snapshot: MatrixSnapshot, config: MatrixConfig) {
    const suites = new Map(snapshot.suites.map(suite => [suite.id, suite]));
    const byVersion = new Map<number, Map<string, Suite[]>>();
    for (const suite of suites.values()) {
        const environment = suite.parentSuiteId === null ? undefined : suites.get(suite.parentSuiteId);
        if (environment?.parentSuiteId == null) continue;
        const contents = byVersion.get(environment.parentSuiteId) ?? new Map<string, Suite[]>();
        const candidates = contents.get(suite.name) ?? [];
        candidates.push(suite);
        contents.set(suite.name, candidates);
        byVersion.set(environment.parentSuiteId, contents);
    }
    const members = new Set(snapshot.projections.map(projection => `${projection.suiteId}:${projection.workItemId}`));
    return (row: CaseContext, column: MatrixColumn) => {
        const version = snapshot.planId === config.planId ? suites.get(column.versionSuiteId) : undefined;
        const contents = version ? byVersion.get(version.id)?.get(row.content) ?? [] : [];
        const candidates = contents.filter(suite => members.has(`${suite.id}:${row.workItemId}`));
        const explicit = config.combinedMappings?.[combinedMappingKey(row, column.id)];
        const suite = explicit ? candidates.find(candidate => candidate.id === explicit) : candidates.length === 1 ? candidates[0] : undefined;
        const ambiguous = !explicit && candidates.length > 1;
        const reason = !version ? 'Versions-Suite ist im aktiven Plan ungültig.' : suite ? ''
            : explicit ? 'Gespeicherte Umgebungsauswahl ist ungültig. Bitte erneut auswählen.'
            : ambiguous ? 'Umgebung auswählen: Dieser Testfall kommt in mehreren Quellsuites dieser Version vor.'
            : contents.length ? 'Testfall ist in keiner passenden Inhaltssuite dieser Version enthalten.'
            : 'Inhaltliche Suite fehlt unter dieser Version.';
        return { suite, candidates, ambiguous, reason, missingMembership: !!version && contents.length > 0 && candidates.length === 0 && !explicit };
    };
}
