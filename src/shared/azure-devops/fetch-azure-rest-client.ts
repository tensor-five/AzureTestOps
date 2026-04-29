import type {
  AzureHttpResponse,
  AzureRestHttpClient
} from "./azure-rest-client.js";

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  status: number;
  text: () => Promise<string>;
  headers: { get(name: string): string | null; forEach(cb: (value: string, name: string) => void): void };
}>;

export type AzureBearerProvider = () => Promise<{ accessToken: string }>;

export type AzurePatProvider = () => string | null;

export type FetchAzureRestClientOptions = {
  bearer?: AzureBearerProvider;
  /** Personal Access Token fallback (e.g. from `ADO_PAT`). Wins over bearer if provided. */
  pat?: AzurePatProvider;
  fetchImpl?: FetchLike;
  /** Logical request timeout per call. Defaults to 60s. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Production HTTP client for Azure DevOps REST. Supplies authentication via
 * either an Azure CLI bearer token (default) or a PAT (env override) and
 * normalizes the response into the {@link AzureHttpResponse} shape the
 * adapters expect.
 *
 * Why a thin wrapper rather than direct `fetch` in adapters: keeps adapters
 * agnostic to auth, lets us inject a stub in tests, and centralizes the
 * "best-effort JSON parse + collected headers" behaviour.
 */
export class FetchAzureRestClient implements AzureRestHttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly bearer?: AzureBearerProvider;
  private readonly pat?: AzurePatProvider;
  private readonly timeoutMs: number;

  public constructor(options: FetchAzureRestClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.bearer = options.bearer;
    this.pat = options.pat;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async get(url: string): Promise<AzureHttpResponse> {
    return this.send(url, "GET");
  }

  public async patch(
    url: string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<AzureHttpResponse> {
    return this.send(url, "PATCH", body, headers);
  }

  private async send(
    url: string,
    method: "GET" | "PATCH",
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<AzureHttpResponse> {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...(extraHeaders ?? {})
    };

    if (method === "PATCH") {
      headers["content-type"] = headers["content-type"] ?? "application/json-patch+json";
    }

    const authHeader = await this.resolveAuthHeader();
    if (authHeader) {
      headers.authorization = authHeader;
    }

    const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
    if (method === "PATCH") {
      init.body = typeof body === "string" ? body : JSON.stringify(body ?? []);
    }

    const response = await this.withTimeout(this.fetchImpl(url, init));

    const text = await response.text();
    const json = parseJsonSafely(text);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name.toLowerCase()] = value;
    });

    return {
      status: response.status,
      json: json !== undefined ? json : text,
      headers: responseHeaders
    };
  }

  private async resolveAuthHeader(): Promise<string | null> {
    if (this.pat) {
      const token = this.pat();
      if (token && token.length > 0) {
        const encoded = Buffer.from(`:${token}`, "utf8").toString("base64");
        return `Basic ${encoded}`;
      }
    }
    if (this.bearer) {
      const { accessToken } = await this.bearer();
      if (accessToken && accessToken.length > 0) {
        return `Bearer ${accessToken}`;
      }
    }
    return null;
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const handle = setTimeout(() => {
        reject(new Error(`Azure REST request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      promise
        .then((value) => {
          clearTimeout(handle);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(handle);
          reject(error);
        });
    });
  }
}

function parseJsonSafely(text: string): unknown {
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const defaultFetch: FetchLike = (url, init) =>
  fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;
