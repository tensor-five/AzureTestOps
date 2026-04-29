import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AdoContext,
  AdoContextPort
} from "../../../application/ports/ado-context.port.js";

type PersistedAdoContext = {
  version: 1;
  organization: string;
  project: string;
};

const CURRENT_VERSION = 1 as const;

/**
 * Stores {@link AdoContext} as JSON on disk (default
 * `~/.azure-testops/ado-context.json`).
 *
 * Robustness rules:
 *   - missing file → `null` (callers prompt for setup).
 *   - unreadable / malformed file → `null` (silent — callers re-prompt and
 *     overwrite). The file is local and easy to recover.
 */
export class FileAdoContextAdapter implements AdoContextPort {
  public constructor(private readonly filePath: string) {}

  public async getContext(): Promise<AdoContext | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf-8");
    } catch (error) {
      if (isNodeFileNotFoundError(error)) {
        return null;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    return sanitizePersisted(parsed);
  }

  public async setContext(context: AdoContext): Promise<AdoContext> {
    const organization = context.organization?.trim();
    const project = context.project?.trim();
    if (!organization || !project) {
      throw new Error("FileAdoContextAdapter.setContext: organization and project are required");
    }

    const payload: PersistedAdoContext = {
      version: CURRENT_VERSION,
      organization,
      project
    };

    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

    return { organization, project };
  }
}

function sanitizePersisted(value: unknown): AdoContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== CURRENT_VERSION) {
    return null;
  }

  const organization = readNonEmpty(candidate.organization);
  const project = readNonEmpty(candidate.project);
  if (!organization || !project) {
    return null;
  }

  return { organization, project };
}

function readNonEmpty(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isNodeFileNotFoundError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === "ENOENT";
}
