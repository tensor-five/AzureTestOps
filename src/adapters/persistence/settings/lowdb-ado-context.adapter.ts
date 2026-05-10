import type {
  AdoContext,
  AdoContextPort
} from "../../../application/ports/ado-context.port.js";
import type { UserPreferencesPort } from "../../../application/ports/user-preferences.port.js";
import { sanitizeAdoContextPreference } from "../../../shared/user-preferences/user-preferences.schema.js";

/**
 * Persists the active Azure DevOps organization/project inside the lowdb-backed
 * user preferences file. This keeps all user-local settings under the same
 * `/phase2/user-preferences` persistence source.
 */
export class LowdbAdoContextAdapter implements AdoContextPort {
  public constructor(private readonly preferences: UserPreferencesPort) {}

  public async getContext(): Promise<AdoContext | null> {
    const preferences = await this.preferences.getPreferences();
    return sanitizeAdoContextPreference(preferences.adoContext);
  }

  public async setContext(context: AdoContext): Promise<AdoContext> {
    const sanitized = sanitizeAdoContextPreference(context);
    if (!sanitized) {
      throw new Error("LowdbAdoContextAdapter.setContext: organization and project are required");
    }

    const preferences = await this.preferences.mergePreferences({ adoContext: sanitized });
    return sanitizeAdoContextPreference(preferences.adoContext) ?? sanitized;
  }
}
