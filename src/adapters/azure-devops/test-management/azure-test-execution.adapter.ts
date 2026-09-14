import type { TestExecutionPort } from '../../../application/ports/test-execution.port.js';
import type { ManualOutcome } from '../../../domain/release-matrix/matrix-config.js';
import { buildAdoBaseUrl, type AdoOrgProjectContext, type AzureRestHttpClient, type AzureHttpResponse } from '../../../shared/azure-devops/azure-rest-client.js';
export class AzureTestExecutionAdapter implements TestExecutionPort {
    private readonly base: string;
    constructor(private readonly client: AzureRestHttpClient, context: AdoOrgProjectContext) { this.base = buildAdoBaseUrl(context) + '/_apis/test/runs'; }
    async createManualRun(planId: number, pointId: number): Promise<number> {
        if (!this.client.post)
            throw new Error('Schreibzugriff auf Testläufe ist nicht verfügbar.');
        const response = await this.client.post(`${this.base}?api-version=7.1`, { name: `Manueller Durchlauf ${new Date().toISOString()}`, plan: { id: planId }, pointIds: [pointId], automated: false, state: 'InProgress' });
        this.check(response);
        const id = Number((response.json as {
            id?: unknown;
        })?.id);
        if (!Number.isSafeInteger(id) || id <= 0)
            throw new Error('Azure hat keine Durchlauf-ID geliefert.');
        return id;
    }
    async completeResult(runId: number, resultId: number, outcome: ManualOutcome): Promise<void> {
        await this.patch(`${this.base}/${runId}/results?api-version=7.1`, [{ id: resultId, outcome, state: 'Completed', completedDate: new Date().toISOString() }]);
    }
    async completeRun(runId: number): Promise<void> { await this.patch(`${this.base}/${runId}?api-version=7.1`, { state: 'Completed' }); }
    private async patch(url: string, body: unknown): Promise<void> {
        if (!this.client.patch)
            throw new Error('Schreibzugriff auf Testläufe ist nicht verfügbar.');
        this.check(await this.client.patch(url, body, { 'content-type': 'application/json' }));
    }
    private check(response: AzureHttpResponse): void {
        if (response.status < 200 || response.status >= 300)
            throw new Error(`Azure konnte den Testlauf nicht speichern (HTTP ${response.status}).`);
    }
}
