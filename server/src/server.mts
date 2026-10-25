import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EvidenceApiError } from "./evidence/evidenceTypes.mts";
import { EvidenceService } from "./evidence/evidenceService.mts";
import { PrivateEvidenceStore } from "./evidence/privateEvidenceStore.mts";
import { createEvidenceRoute, sendError } from "./routes/evidence.mts";
import { handleHealthRoute } from "./routes/health.mts";

export function createEvidenceApiServer(
  store = new PrivateEvidenceStore()
) {
  const service = new EvidenceService(store);
  const handleEvidence = createEvidenceRoute(service);

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      if (handleHealthRoute(request, response)) return;
      if (await handleEvidence(request, response)) return;
      sendError(response, new EvidenceApiError(404, "NOT_FOUND", "Route was not found."));
    } catch (error) {
      if (error instanceof EvidenceApiError) {
        sendError(response, error);
        return;
      }

      console.error("Evidence API request failed:", error);
      if (!response.headersSent) {
        sendError(
          response,
          new EvidenceApiError(500, "INTERNAL_ERROR", "The request could not be completed.")
        );
      } else {
        response.destroy();
      }
    }
  });
}
