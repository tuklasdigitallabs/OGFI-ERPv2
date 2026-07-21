import { readEvidenceBrokerConfig } from "./config";
import { createEvidenceBrokerServer } from "./server";

process.umask(0o077);

const config = await readEvidenceBrokerConfig();
const portRaw = process.env.EVIDENCE_BROKER_PORT?.trim() || "8787";
const port = Number(portRaw);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("EVIDENCE_BROKER_PORT_INVALID");
}
const listenHost = process.env.EVIDENCE_BROKER_LISTEN_HOST?.trim() || "0.0.0.0";
if (!["0.0.0.0", "127.0.0.1"].includes(listenHost)) {
  throw new Error("EVIDENCE_BROKER_LISTEN_HOST_INVALID");
}

const server = createEvidenceBrokerServer(config);
server.listen(port, listenHost);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close((error) => {
      process.exitCode = error ? 1 : 0;
    });
  });
}
