import { requestWithRetry } from "../../../shared/utils/retry.js";
import {
  buildAdoBaseUrl,
  type AdoOrgProjectContext,
  type AzureRestHttpClient
} from "../../../shared/azure-devops/azure-rest-client.js";
import type { RelationPort } from "../../../application/ports/relation.port.js";
import type { RelatedLink } from "../../../domain/relations/related-link.js";

const API_VERSION_71 = "7.1";
const RELATED_LINK_TYPE = "System.LinkTypes.Related";
const JSON_PATCH_CONTENT_TYPE = "application/json-patch+json";
const WORK_ITEM_URL_ID_PATTERN = /\/workItems\/(\d+)(?:[?#].*)?$/i;
const RELATION_ALREADY_EXISTS_MARKER = /RelationAlreadyExists/i;

type AzureRestPatchClient = Required<Pick<AzureRestHttpClient, "patch">> &
  Pick<AzureRestHttpClient, "get">;

type WorkItemSnapshot = {
  rev: number;
  relations: ReadonlyArray<{ rel: string; url: string }>;
};

/**
 * Azure DevOps adapter for the write-side of `System.LinkTypes.Related`
 * links. Implements optimistic concurrency (`op:test /rev`) and the
 * idempotency contract described on {@link RelationPort}.
 */
export class AzureRelationAdapter implements RelationPort {
  private readonly baseUrl: string;
  private readonly orgBaseUrl: string;

  public constructor(
    private readonly httpClient: AzureRestHttpClient,
    context: AdoOrgProjectContext
  ) {
    if (!httpClient.patch) {
      throw new Error("AzureRelationAdapter: httpClient.patch is required");
    }
    this.baseUrl = buildAdoBaseUrl(context);
    const organization = context.organization
      .trim()
      .replace(/^https?:\/\/dev\.azure\.com\//i, "")
      .replace(/\/$/, "");
    this.orgBaseUrl = `https://dev.azure.com/${encodeURIComponent(organization)}`;
  }

  public async addRelation(link: RelatedLink): Promise<void> {
    const client = this.httpClient as AzureRestPatchClient;
    let snapshot = await this.fetchWorkItem(client, link.sourceWorkItemId);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const body = [
        { op: "test", path: "/rev", value: snapshot.rev },
        {
          op: "add",
          path: "/relations/-",
          value: {
            rel: RELATED_LINK_TYPE,
            url: `${this.orgBaseUrl}/_apis/wit/workItems/${link.targetWorkItemId}`,
            attributes: { comment: "" }
          }
        }
      ];

      const { response } = await requestWithRetry(() =>
        client.patch(this.workItemPatchUrl(link.sourceWorkItemId), body, {
          "content-type": JSON_PATCH_CONTENT_TYPE
        })
      );

      if (response.status === 200) {
        return;
      }
      if (response.status === 400 && containsRelationAlreadyExists(response.json)) {
        return;
      }
      if (response.status === 409 && attempt === 1) {
        snapshot = await this.fetchWorkItem(client, link.sourceWorkItemId);
        continue;
      }
      throw new Error(`RELATION_ADD_HTTP_${response.status}`);
    }
  }

  public async removeRelation(link: RelatedLink): Promise<void> {
    const client = this.httpClient as AzureRestPatchClient;
    let snapshot = await this.fetchWorkItem(client, link.sourceWorkItemId);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const index = findRelatedRelationIndex(snapshot.relations, link.targetWorkItemId);
      if (index === -1) {
        return; // already absent → idempotent no-op
      }

      const body = [
        { op: "test", path: "/rev", value: snapshot.rev },
        { op: "remove", path: `/relations/${index}` }
      ];

      const { response } = await requestWithRetry(() =>
        client.patch(this.workItemPatchUrl(link.sourceWorkItemId), body, {
          "content-type": JSON_PATCH_CONTENT_TYPE
        })
      );

      if (response.status === 200) {
        return;
      }
      if (response.status === 404) {
        return; // relation vanished between read and write → idempotent
      }
      if (response.status === 409 && attempt === 1) {
        snapshot = await this.fetchWorkItem(client, link.sourceWorkItemId);
        continue;
      }
      throw new Error(`RELATION_REMOVE_HTTP_${response.status}`);
    }
  }

  private workItemPatchUrl(workItemId: number): string {
    return `${this.baseUrl}/_apis/wit/workitems/${workItemId}?api-version=${API_VERSION_71}`;
  }

  private async fetchWorkItem(
    client: AzureRestPatchClient,
    workItemId: number
  ): Promise<WorkItemSnapshot> {
    const url = `${this.baseUrl}/_apis/wit/workitems/${workItemId}?$expand=relations&api-version=${API_VERSION_71}`;
    const { response } = await requestWithRetry(() => client.get(url));
    if (response.status !== 200) {
      throw new Error(`RELATION_READ_HTTP_${response.status}`);
    }
    return parseWorkItemSnapshot(response.json);
  }
}

function parseWorkItemSnapshot(payload: unknown): WorkItemSnapshot {
  if (!payload || typeof payload !== "object") {
    throw new Error("RELATION_READ_INVALID_PAYLOAD");
  }
  const candidate = payload as { rev?: unknown; relations?: unknown };
  if (typeof candidate.rev !== "number" || !Number.isFinite(candidate.rev)) {
    throw new Error("RELATION_READ_MISSING_REV");
  }
  const relations: { rel: string; url: string }[] = [];
  if (Array.isArray(candidate.relations)) {
    for (const raw of candidate.relations) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const rel = (raw as { rel?: unknown }).rel;
      const url = (raw as { url?: unknown }).url;
      if (typeof rel === "string" && typeof url === "string") {
        relations.push({ rel, url });
      }
    }
  }
  return { rev: candidate.rev, relations };
}

function findRelatedRelationIndex(
  relations: ReadonlyArray<{ rel: string; url: string }>,
  targetWorkItemId: number
): number {
  for (let i = 0; i < relations.length; i += 1) {
    const relation = relations[i];
    if (relation.rel !== RELATED_LINK_TYPE) {
      continue;
    }
    const match = relation.url.match(WORK_ITEM_URL_ID_PATTERN);
    if (match && Number.parseInt(match[1], 10) === targetWorkItemId) {
      return i;
    }
  }
  return -1;
}

function containsRelationAlreadyExists(payload: unknown): boolean {
  if (!payload) {
    return false;
  }
  if (typeof payload === "string") {
    return RELATION_ALREADY_EXISTS_MARKER.test(payload);
  }
  if (typeof payload !== "object") {
    return false;
  }
  const candidate = payload as { typeKey?: unknown; message?: unknown };
  if (typeof candidate.typeKey === "string" && RELATION_ALREADY_EXISTS_MARKER.test(candidate.typeKey)) {
    return true;
  }
  if (typeof candidate.message === "string" && RELATION_ALREADY_EXISTS_MARKER.test(candidate.message)) {
    return true;
  }
  return false;
}
