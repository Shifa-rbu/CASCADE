import type { IncomingMessage, ServerResponse } from "node:http";

export function handleHealthRoute(
  request: IncomingMessage,
  response: ServerResponse
): boolean {
  if (request.method !== "GET" || request.url !== "/api/v1/health") return false;

  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ status: "ok", service: "evidence-api" }));
  return true;
}
