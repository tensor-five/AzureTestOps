import os from "node:os";

/**
 * Resolves the OS-level username for telemetry / lowdb scoping.
 *
 * Falls back through `process.env.USER` / `process.env.USERNAME` first so
 * containerised hosts (where `os.userInfo()` may throw or return `unknown`)
 * still resolve a stable identity. Returns the literal `"local-user"` only as
 * a last resort so downstream code never has to handle a missing id.
 */
export function resolveLocalUserId(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.USER ?? env.USERNAME;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  try {
    const username = os.userInfo().username;
    if (username && username.trim().length > 0) {
      return username.trim();
    }
  } catch {
    // os.userInfo() can throw on some sandboxed runtimes — fall through.
  }

  return "local-user";
}
