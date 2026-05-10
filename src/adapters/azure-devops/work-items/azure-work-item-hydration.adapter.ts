import { mapConcurrent } from "../../../shared/utils/concurrency.js";
import { requestWithRetry } from "../../../shared/utils/retry.js";
import {
  buildAdoBaseUrl,
  type AdoOrgProjectContext,
  type AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";
import type { WorkItemHydrationPort } from "../../../application/ports/work-item-hydration.port.js";
import type { WorkItem } from "../../../domain/work-items/work-item.js";

const API_VERSION_71 = "7.1";
const MAX_IDS_PER_REQUEST = 200;
const DEFAULT_CONCURRENCY = 4;
const SUPPORTED_LINK_TYPES = new Set<string>([
  "System.LinkTypes.Related",
  "Microsoft.VSTS.Common.TestedBy-Forward",
  "Microsoft.VSTS.Common.TestedBy-Reverse"
]);
const WORK_ITEM_URL_ID_PATTERN = /\/workItems\/(\d+)(?:[?#].*)?$/i;

export type AzureWorkItemHydrationAdapterOptions = {
  /** Max ids per HTTP request. Capped by Azure at 200. */
  chunkSize?: number;
  /** Max parallel chunk requests. Defaults to 4 to stay below ADO rate limits. */
  concurrency?: number;
};

export class AzureWorkItemHydrationAdapter implements WorkItemHydrationPort {
  private readonly baseUrl: string;
  private readonly chunkSize: number;
  private readonly concurrency: number;

  public constructor(
    private readonly httpClient: AzureRestHttpClient,
    context: AdoOrgProjectContext,
    options: AzureWorkItemHydrationAdapterOptions = {}
  ) {
    this.baseUrl = buildAdoBaseUrl(context);
    this.chunkSize = Math.min(options.chunkSize ?? MAX_IDS_PER_REQUEST, MAX_IDS_PER_REQUEST);
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  }

  public async hydrateWorkItems(ids: number[]): Promise<Map<number, WorkItem>> {
    const dedupedIds = [...new Set(ids)].filter((id) => Number.isFinite(id));
    if (dedupedIds.length === 0) {
      return new Map();
    }

    const chunks = chunk(dedupedIds, this.chunkSize);
    const responses = await mapConcurrent(chunks, this.concurrency, async (chunkIds) =>
      this.hydrateChunk(chunkIds)
    );

    const merged = new Map<number, WorkItem>();
    for (const chunkMap of responses) {
      for (const [id, item] of chunkMap) {
        merged.set(id, item);
      }
    }
    return merged;
  }

  private async hydrateChunk(ids: number[]): Promise<Map<number, WorkItem>> {
    const url = `${this.baseUrl}/_apis/wit/workitems?ids=${ids.join(",")}&$expand=relations&api-version=${API_VERSION_71}`;
    const { response } = await requestWithRetry(() => this.httpClient.get(url));
    if (response.status !== 200) {
      throw new Error(`HYDRATION_HTTP_${response.status}`);
    }

    const value = readArray((response.json as { value?: unknown }).value);
    const map = new Map<number, WorkItem>();
    for (const raw of value) {
      const item = toWorkItem(raw);
      if (item) {
        map.set(item.id, item);
      }
    }
    return map;
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toWorkItem(value: unknown): WorkItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const id = readNumber(candidate.id);
  if (id === null) {
    return null;
  }

  const fields = (candidate.fields ?? {}) as Record<string, unknown>;
  const assignedToRaw = fields["System.AssignedTo"];
  const assignedTo =
    assignedToRaw && typeof assignedToRaw === "object" && "displayName" in assignedToRaw
      ? String((assignedToRaw as { displayName?: unknown }).displayName ?? "").trim() || null
      : typeof assignedToRaw === "string"
        ? assignedToRaw.trim() || null
        : null;

  const tagsRaw = fields["System.Tags"];
  const tags =
    typeof tagsRaw === "string"
      ? tagsRaw
          .split(";")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];

  const relations = Array.isArray(candidate.relations) ? candidate.relations : [];
  const relatedIds: number[] = [];
  for (const relation of relations) {
    if (!relation || typeof relation !== "object") {
      continue;
    }
    const rel = (relation as { rel?: unknown }).rel;
    const url = (relation as { url?: unknown }).url;
    if (typeof rel !== "string" || !SUPPORTED_LINK_TYPES.has(rel) || typeof url !== "string") {
      continue;
    }
    const match = url.match(WORK_ITEM_URL_ID_PATTERN);
    if (match) {
      const relatedId = Number.parseInt(match[1], 10);
      if (Number.isFinite(relatedId)) {
        relatedIds.push(relatedId);
      }
    }
  }

  return {
    id,
    workItemType: typeof fields["System.WorkItemType"] === "string" ? (fields["System.WorkItemType"] as string) : "",
    title: typeof fields["System.Title"] === "string" ? (fields["System.Title"] as string) : "",
    state: typeof fields["System.State"] === "string" ? (fields["System.State"] as string) : "",
    assignedTo,
    tags,
    areaPath: typeof fields["System.AreaPath"] === "string" ? (fields["System.AreaPath"] as string) : null,
    priority: readNumber(fields["Microsoft.VSTS.Common.Priority"]),
    relatedIds
  };
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
