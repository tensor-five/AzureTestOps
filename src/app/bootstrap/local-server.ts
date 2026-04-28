import { createHttpServer } from "./http-server.js";
import { resolveAzCliExecutablePath } from "../../shared/utils/azure-cli-path.js";

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

  const server = createHttpServer({ port: PORT });

  const closeServer = (): void => {
    void server.close();
    process.exit(0);
  };

  process.on("SIGINT", closeServer);
  process.on("SIGTERM", closeServer);

  console.log(`Local server listening on http://127.0.0.1:${PORT}`);
}

void main();
