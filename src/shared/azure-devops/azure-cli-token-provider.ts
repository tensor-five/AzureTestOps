import { resolveAzCliExecutablePath } from "../utils/azure-cli-path.js";
import { runAzCli } from "../utils/azure-cli-runner.js";

/** Azure DevOps resource id for `az account get-access-token --resource`. */
export const ADO_RESOURCE_ID = "499b84ac-1321-427f-aa17-267ca6975798";

const TOKEN_REFRESH_SKEW_MS = 2 * 60_000;
const TOKEN_FETCH_TIMEOUT_MS = 30_000;

export type AzureAccessToken = {
  accessToken: string;
  expiresOn: number;
};

export interface CliTokenRunner {
  run(executable: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export type AzureCliTokenProviderOptions = {
  resource?: string;
  /** Injectable for tests; defaults to executing `az` on the host. */
  runner?: CliTokenRunner;
  /** Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
};

/**
 * Caches a bearer token obtained via `az account get-access-token` and
 * refreshes it shortly before expiry. The token's resource id is the Azure
 * DevOps app id (constant) — Azure DevOps does not honour
 * Resource Manager-scoped tokens.
 */
export class AzureCliTokenProvider {
  private cached: AzureAccessToken | null = null;
  private inFlight: Promise<AzureAccessToken> | null = null;

  public constructor(private readonly options: AzureCliTokenProviderOptions = {}) {}

  public async getAccessToken(): Promise<AzureAccessToken> {
    if (this.cached && this.now() < this.cached.expiresOn - TOKEN_REFRESH_SKEW_MS) {
      return this.cached;
    }
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.fetchToken()
      .then((token) => {
        this.cached = token;
        return token;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  public invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<AzureAccessToken> {
    const executable = await resolveAzCliExecutablePath();
    const resource = this.options.resource ?? ADO_RESOURCE_ID;
    const runner = this.options.runner ?? defaultRunner;

    const result = await runner.run(executable, [
      "account",
      "get-access-token",
      "--resource",
      resource,
      "--output",
      "json"
    ]);

    if (result.exitCode !== 0) {
      throw new Error(
        `Azure CLI access token request failed (exit ${result.exitCode}): ${result.stderr.trim()}`
      );
    }

    const parsed = parseTokenJson(result.stdout);
    if (!parsed) {
      throw new Error("Azure CLI access token response was not parsable JSON.");
    }
    return parsed;
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}

function parseTokenJson(stdout: string): AzureAccessToken | null {
  try {
    const payload = JSON.parse(stdout) as Record<string, unknown>;
    const accessToken = typeof payload.accessToken === "string" ? payload.accessToken : null;
    const expiresOnRaw = payload.expiresOn ?? payload.expires_on ?? payload.expiresOnTimestamp;
    if (!accessToken) {
      return null;
    }
    const expiresOn = parseExpiresOn(expiresOnRaw);
    if (expiresOn === null) {
      return null;
    }
    return { accessToken, expiresOn };
  } catch {
    return null;
  }
}

function parseExpiresOn(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && value.length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const defaultRunner: CliTokenRunner = {
  run: (executable, args) => runAzCli(executable, args, { timeoutMs: TOKEN_FETCH_TIMEOUT_MS })
};
