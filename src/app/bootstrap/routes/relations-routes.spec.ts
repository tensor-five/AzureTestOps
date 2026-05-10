import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import type { RelationPort } from "../../../application/ports/relation.port.js";
import type { AdoRuntime } from "../../composition/runtime.js";

import { registerRelationsRoutes } from "./relations-routes.js";

type Captured = {
  status?: number;
  body?: string;
};

function makeResponse(): { res: import("node:http").ServerResponse; captured: Captured } {
  const captured: Captured = {};
  const res = {
    set statusCode(value: number) {
      captured.status = value;
    },
    get statusCode() {
      return captured.status ?? 200;
    },
    setHeader() {},
    end(payload: string) {
      captured.body = payload;
    },
    headersSent: false
  } as unknown as import("node:http").ServerResponse;
  return { res, captured };
}

function makeRequest(body: unknown): import("node:http").IncomingMessage {
  const stream = Readable.from([Buffer.from(JSON.stringify(body), "utf8")]);
  return stream as unknown as import("node:http").IncomingMessage;
}

function makeAdoRuntime(relations: RelationPort): AdoRuntime {
  return {
    resolveContext: async () => ({ organization: "c", project: "p" }),
    testManagement: async () => {
      throw new Error("not used");
    },
    testCatalog: async () => {
      throw new Error("not used");
    },
    workItemHydration: async () => {
      throw new Error("not used");
    },
    testCaseHydration: async () => {
      throw new Error("not used");
    },
    savedQuery: async () => {
      throw new Error("not used");
    },
    relations: async () => relations
  };
}

const NOT_CONFIGURED_ERROR = Object.assign(new Error("not configured"), {
  code: "ADO_CONTEXT_NOT_CONFIGURED"
});

describe("registerRelationsRoutes", () => {
  it("declines paths other than /phase2/relations", async () => {
    const route = registerRelationsRoutes(
      makeAdoRuntime({
        addRelation: vi.fn(),
        removeRelation: vi.fn()
      })
    );
    const { res } = makeResponse();
    const handled = await route("POST", "/phase2/sets", makeRequest({}), res);
    expect(handled).toBe(false);
  });

  it("rejects unsupported methods with 405", async () => {
    const route = registerRelationsRoutes(
      makeAdoRuntime({
        addRelation: vi.fn(),
        removeRelation: vi.fn()
      })
    );
    const { res, captured } = makeResponse();
    const handled = await route("GET", "/phase2/relations", makeRequest(""), res);
    expect(handled).toBe(true);
    expect(captured.status).toBe(405);
  });

  it("creates a relation on POST with valid body", async () => {
    const addRelation = vi.fn(async () => undefined);
    const route = registerRelationsRoutes(
      makeAdoRuntime({
        addRelation,
        removeRelation: vi.fn()
      })
    );
    const { res, captured } = makeResponse();
    const handled = await route(
      "POST",
      "/phase2/relations",
      makeRequest({ sourceId: 11, targetId: 22 }),
      res
    );

    expect(handled).toBe(true);
    expect(captured.status).toBe(200);
    expect(addRelation).toHaveBeenCalledWith({ sourceWorkItemId: 11, targetWorkItemId: 22 });
  });

  it("removes a relation on DELETE with valid body", async () => {
    const removeRelation = vi.fn(async () => undefined);
    const route = registerRelationsRoutes(
      makeAdoRuntime({
        addRelation: vi.fn(),
        removeRelation
      })
    );
    const { res, captured } = makeResponse();
    const handled = await route(
      "DELETE",
      "/phase2/relations",
      makeRequest({ sourceId: 33, targetId: 44 }),
      res
    );

    expect(handled).toBe(true);
    expect(captured.status).toBe(200);
    expect(removeRelation).toHaveBeenCalledWith({ sourceWorkItemId: 33, targetWorkItemId: 44 });
  });

  it("rejects bodies with non-positive ids", async () => {
    const route = registerRelationsRoutes(
      makeAdoRuntime({
        addRelation: vi.fn(),
        removeRelation: vi.fn()
      })
    );
    const { res, captured } = makeResponse();
    await route("POST", "/phase2/relations", makeRequest({ sourceId: 0, targetId: 1 }), res);
    expect(captured.status).toBe(400);
  });

  it("rejects identical source and target", async () => {
    const route = registerRelationsRoutes(
      makeAdoRuntime({
        addRelation: vi.fn(),
        removeRelation: vi.fn()
      })
    );
    const { res, captured } = makeResponse();
    await route("POST", "/phase2/relations", makeRequest({ sourceId: 5, targetId: 5 }), res);
    expect(captured.status).toBe(400);
  });

  it("translates ADO_CONTEXT_NOT_CONFIGURED into HTTP 412", async () => {
    const ado: AdoRuntime = {
      resolveContext: async () => ({ organization: "c", project: "p" }),
      testManagement: async () => {
        throw new Error("not used");
      },
      testCatalog: async () => {
        throw new Error("not used");
      },
      workItemHydration: async () => {
        throw new Error("not used");
      },
      testCaseHydration: async () => {
        throw new Error("not used");
      },
      savedQuery: async () => {
        throw new Error("not used");
      },
      relations: async () => {
        throw NOT_CONFIGURED_ERROR;
      }
    };
    const route = registerRelationsRoutes(ado);
    const { res, captured } = makeResponse();
    await route("POST", "/phase2/relations", makeRequest({ sourceId: 1, targetId: 2 }), res);
    expect(captured.status).toBe(412);
    expect(JSON.parse(captured.body ?? "")).toEqual({
      code: "ADO_CONTEXT_NOT_CONFIGURED",
      message: "Configure organization and project under /phase2/ado-context first."
    });
  });

  it("propagates adapter errors as 500 with the fallback code", async () => {
    const route = registerRelationsRoutes(
      makeAdoRuntime({
        addRelation: vi.fn(async () => {
          throw new Error("upstream boom");
        }),
        removeRelation: vi.fn()
      })
    );
    const { res, captured } = makeResponse();
    await route("POST", "/phase2/relations", makeRequest({ sourceId: 1, targetId: 2 }), res);
    expect(captured.status).toBe(500);
    const body = JSON.parse(captured.body ?? "");
    expect(body.code).toBe("RELATION_CREATE_FAILED");
    expect(body.message).toBe("upstream boom");
  });
});
