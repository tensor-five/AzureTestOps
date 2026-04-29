import os from "node:os";

import { createHttpServer } from "./http-server.js";
import { resolveAzCliExecutablePath } from "../../shared/utils/azure-cli-path.js";
import { buildRuntime } from "../composition/runtime.js";

const PORT = Number(process.env.PORT ?? "8081");

if (process.env.ADO_VERBOSE_LOGS !== "1") {
  process.env.ADO_VERBOSE_LOGS = "1";
}
if (process.env.ADO_WRITE_ENABLED !== "1") {
  process.env.ADO_WRITE_ENABLED = "1";
}

async function main(): Promise<void> {
  let detectedAzCliPath = "az";
  try {
    detectedAzCliPath = await resolveAzCliExecutablePath();
  } catch {
    console.warn("[ado-runtime] Azure CLI not found — auth features will be unavailable until 'az' is installed.");
  }

  if (!process.env.ADO_AZ_CLI_PATH && detectedAzCliPath !== "az") {
    process.env.ADO_AZ_CLI_PATH = detectedAzCliPath;
  }

  if (process.env.ADO_VERBOSE_LOGS === "1") {
    console.log(`[ado-runtime] ADO_AZ_CLI_PATH=${detectedAzCliPath}`);
  }

  const runtime = buildRuntime({
    localUserId: resolveLocalUserId()
  });

  const server = createHttpServer({
    port: PORT,
    deps: {
      preflight: runtime.preflight,
      userPreferences: runtime.userPreferences,
      setRepository: runtime.setRepository,
      adoContext: runtime.adoContext,
      ado: runtime.ado
    }
  });

  const closeServer = (): void => {
    void server.close();
    process.exit(0);
  };

  process.on("SIGINT", closeServer);
  process.on("SIGTERM", closeServer);

  console.log(`Local server listening on http://127.0.0.1:${PORT}`);
}

function resolveLocalUserId(): string {
  const fromEnv = process.env.USER ?? process.env.USERNAME;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  try {
    return os.userInfo().username;
  } catch {
    return "local-user";
  }
}

void main();
