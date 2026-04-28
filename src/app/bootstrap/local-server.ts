import { createHttpServer } from "./http-server.js";

const PORT = Number(process.env.PORT ?? "8081");

if (process.env.ADO_VERBOSE_LOGS !== "1") {
  process.env.ADO_VERBOSE_LOGS = "1";
}
if (process.env.ADO_WRITE_ENABLED !== "1") {
  process.env.ADO_WRITE_ENABLED = "1";
}

const server = createHttpServer({ port: PORT });

const closeServer = (): void => {
  void server.close();
  process.exit(0);
};

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);

console.log(`Local server listening on http://127.0.0.1:${PORT}`);
