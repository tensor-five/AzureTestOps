import type { TestPointResetPort } from '../../../application/ports/test-point-reset.port.js';
import { buildAdoBaseUrl, type AdoOrgProjectContext, type AzureRestHttpClient } from '../../../shared/azure-devops/azure-rest-client.js';

export class AzureTestPointResetAdapter implements TestPointResetPort {
  private readonly base: string;
  constructor(private readonly client: AzureRestHttpClient, context: AdoOrgProjectContext) {
    this.base = buildAdoBaseUrl(context) + '/_apis/test/Plans';
  }
  async resetToActive(planId: number, suiteId: number, pointId: number): Promise<void> {
    if (!this.client.patch) throw new Error('Schreibzugriff auf Testpunkte ist nicht verfügbar.');
    // Never retry: a transport failure can occur after Azure accepted the reset.
    const response = await this.client.patch(`${this.base}/${planId}/Suites/${suiteId}/points/${pointId}?api-version=7.1`,
      { resetToActive: true }, { 'content-type': 'application/json' });
    if (response.status < 200 || response.status >= 300) throw new Error(`POINT_RESET_HTTP_${response.status}`);
  }
}
