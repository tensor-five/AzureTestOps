import { describe, expect, it } from "vitest";

import {
  AzureCliTokenProvider,
  type CliTokenRunner
} from "./azure-cli-token-provider.js";

function makeStubRunner(payload: { stdout?: string; stderr?: string; exitCode?: number }): {
  runner: CliTokenRunner;
  invocations: Array<{ executable: string; args: string[] }>;
} {
  const invocations: Array<{ executable: string; args: string[] }> = [];
  return {
    invocations,
    runner: {
      run: async (executable, args) => {
        invocations.push({ executable, args });
        return {
          stdout: payload.stdout ?? "",
          stderr: payload.stderr ?? "",
          exitCode: payload.exitCode ?? 0
        };
      }
    }
  };
}

describe("AzureCliTokenProvider", () => {
  it("parses ISO `expiresOn` and caches the token", async () => {
    const expiresOnIso = "2099-12-31T23:59:59.000Z";
    const { runner, invocations } = makeStubRunner({
      stdout: JSON.stringify({ accessToken: "abc", expiresOn: expiresOnIso })
    });

    const provider = new AzureCliTokenProvider({ runner, now: () => 0 });
    const first = await provider.getAccessToken();
    const second = await provider.getAccessToken();

    expect(first.accessToken).toBe("abc");
    expect(first.expiresOn).toBe(Date.parse(expiresOnIso));
    expect(second).toBe(first);
    expect(invocations.length).toBe(1);
    expect(invocations[0].args).toContain("--resource");
    expect(invocations[0].args).toContain("499b84ac-1321-427f-aa17-267ca6975798");
  });

  it("re-fetches once the cached token gets close to expiry", async () => {
    const firstExpires = "2026-04-29T13:00:00.000Z";
    const secondExpires = "2026-04-29T14:00:00.000Z";

    let nowMs = Date.parse("2026-04-29T12:00:00.000Z");

    const tokens = [
      { accessToken: "first", expiresOn: firstExpires },
      { accessToken: "second", expiresOn: secondExpires }
    ];

    const runner: CliTokenRunner = {
      run: async () => {
        const next = tokens.shift();
        if (!next) {
          throw new Error("ran out of stub tokens");
        }
        return { stdout: JSON.stringify(next), stderr: "", exitCode: 0 };
      }
    };

    const provider = new AzureCliTokenProvider({ runner, now: () => nowMs });
    const first = await provider.getAccessToken();
    expect(first.accessToken).toBe("first");

    // Advance to 30 seconds before expiry — well inside the 2 minute skew.
    nowMs = Date.parse(firstExpires) - 30_000;
    const second = await provider.getAccessToken();
    expect(second.accessToken).toBe("second");
  });

  it("throws when the CLI exits with a non-zero status", async () => {
    const { runner } = makeStubRunner({ exitCode: 1, stderr: "AAD blew up" });
    const provider = new AzureCliTokenProvider({ runner, now: () => 0 });

    await expect(provider.getAccessToken()).rejects.toThrow(/AAD blew up/);
  });

  it("throws on malformed JSON", async () => {
    const { runner } = makeStubRunner({ stdout: "not-json" });
    const provider = new AzureCliTokenProvider({ runner, now: () => 0 });

    await expect(provider.getAccessToken()).rejects.toThrow(/not parsable JSON/);
  });
});
