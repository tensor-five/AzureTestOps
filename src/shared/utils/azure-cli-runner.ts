import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildAzCommand } from "./azure-cli-path.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export type AzCliRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type AzCliRunOptions = {
  timeoutMs?: number;
};

/**
 * Invokes the Azure CLI uniformly across platforms. On Windows the `az`
 * binary is shipped as `az.cmd`, and Node's `child_process.execFile` refuses
 * to run `.cmd`/`.bat` without `shell: true` since the CVE-2024-27980 fix —
 * which surfaces as silent exit-code 1 with empty stderr. For those cases we
 * fall back to shell-based `exec` with proper quoting; on every other
 * platform `execFile` stays the more secure default.
 */
export async function runAzCli(
  executable: string,
  args: string[],
  options: AzCliRunOptions = {}
): Promise<AzCliRunResult> {
  const timeout = options.timeoutMs;

  try {
    if (needsShellExecution(executable)) {
      const { stdout, stderr } = await execAsync(buildAzCommand(executable, args), {
        timeout,
        windowsHide: true
      });
      return { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 };
    }

    const { stdout, stderr } = await execFileAsync(executable, args, {
      timeout,
      windowsHide: true
    });
    return { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 };
  } catch (error) {
    const nodeError = error as { stdout?: string; stderr?: string; code?: string | number };
    const exitCode = typeof nodeError.code === "number" ? nodeError.code : 1;
    return {
      stdout: nodeError.stdout ?? "",
      stderr: nodeError.stderr ?? "",
      exitCode
    };
  }
}

function needsShellExecution(executable: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }
  const lower = executable.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}
