import { createEvidenceApiServer } from "./server.mts";
import { PrivateEvidenceStore } from "./evidence/privateEvidenceStore.mts";

const port = Number(process.env.PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = createEvidenceApiServer(new PrivateEvidenceStore());
server.listen(port, "127.0.0.1", () => {
  console.log(`Synthetic evidence API listening on http://127.0.0.1:${port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  server.close((error) => {
    if (error) {
      console.error(`Evidence API failed to close after ${signal}:`, error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
