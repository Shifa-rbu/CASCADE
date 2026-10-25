import type { IncomingMessage, ServerResponse } from "node:http";
import { EvidenceApiError, MAX_FILE_BYTES } from "../evidence/evidenceTypes.mts";
import { EvidenceService } from "../evidence/evidenceService.mts";

const MAX_MULTIPART_OVERHEAD = 64 * 1024;
const EVIDENCE_STATUS_ROUTE =
  /^\/api\/v1\/evidence\/([0-9a-f-]{36})\/status$/i;

interface MultipartFile {
  bytes: Buffer;
  contentType?: string;
  filename?: string;
}

export function createEvidenceRoute(service: EvidenceService) {
  return async function handleEvidenceRoute(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    if (requestUrl.pathname === "/api/v1/evidence") {
      if (request.method !== "POST") {
        sendError(response, new EvidenceApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed."));
        return true;
      }

      const file = await readMultipartFile(request);
      const result = await service.upload(file.bytes, file.contentType, file.filename);
      sendJson(response, 201, result);
      return true;
    }

    const match = EVIDENCE_STATUS_ROUTE.exec(requestUrl.pathname);
    if (match) {
      if (request.method !== "GET") {
        sendError(response, new EvidenceApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed."));
        return true;
      }
      sendJson(response, 200, await service.getStatus(match[1]));
      return true;
    }

    return false;
  };
}

async function readMultipartFile(request: IncomingMessage): Promise<MultipartFile> {
  const contentType = request.headers["content-type"];
  const match =
    typeof contentType === "string" &&
    /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;]+))\s*$/i.exec(contentType);
  if (!match) {
    throw new EvidenceApiError(
      400,
      "INVALID_MULTIPART",
      "Use multipart/form-data with one file field named file."
    );
  }

  const boundary = (match[1] ?? match[2]).trim();
  if (!/^[0-9A-Za-z'()+_,./:=?-]{1,70}$/.test(boundary)) {
    throw new EvidenceApiError(400, "INVALID_MULTIPART", "The multipart boundary is invalid.");
  }

  const body = await readBoundedBody(request, MAX_FILE_BYTES + MAX_MULTIPART_OVERHEAD);
  return parseSingleFilePart(body, boundary);
}

async function readBoundedBody(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const contentLength = request.headers["content-length"];
  if (contentLength && Number(contentLength) > maximumBytes) {
    throw new EvidenceApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the 2 MiB limit.");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let exceededLimit = false;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maximumBytes) {
      exceededLimit = true;
      continue;
    }
    chunks.push(buffer);
  }

  if (exceededLimit) {
    throw new EvidenceApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the 2 MiB limit.");
  }
  return Buffer.concat(chunks, totalBytes);
}

function parseSingleFilePart(body: Buffer, boundary: string): MultipartFile {
  const openingBoundary = Buffer.from(`--${boundary}\r\n`, "ascii");
  const separator = Buffer.from("\r\n\r\n", "ascii");
  const closingBoundary = Buffer.from(`\r\n--${boundary}--`, "ascii");

  if (!body.subarray(0, openingBoundary.length).equals(openingBoundary)) {
    throw new EvidenceApiError(400, "INVALID_MULTIPART", "The multipart body is malformed.");
  }

  const headerStart = openingBoundary.length;
  const headerEnd = body.indexOf(separator, headerStart);
  if (headerEnd < 0) {
    throw new EvidenceApiError(400, "INVALID_MULTIPART", "The multipart file headers are malformed.");
  }

  const headers = body.subarray(headerStart, headerEnd).toString("latin1");
  const disposition = /^content-disposition:\s*form-data;([^\r\n]*)$/im.exec(headers);
  const fieldName = disposition && /(?:^|;)\s*name="([^"]*)"/i.exec(disposition[1])?.[1];
  const filename = disposition && /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition[1])?.[1];
  if (fieldName !== "file" || !filename) {
    throw new EvidenceApiError(400, "INVALID_MULTIPART", "Include exactly one file field named file.");
  }

  const contentType = /^content-type:\s*([^\r\n]+)$/im.exec(headers)?.[1]?.trim();
  const fileStart = headerEnd + separator.length;
  const boundaryPrefix = Buffer.from(`\r\n--${boundary}`, "ascii");
  const fileEnd = body.indexOf(boundaryPrefix, fileStart);
  if (
    fileEnd < 0 ||
    !body.subarray(fileEnd, fileEnd + closingBoundary.length).equals(closingBoundary)
  ) {
    throw new EvidenceApiError(400, "INVALID_MULTIPART", "The multipart body must contain exactly one file.");
  }

  const suffix = body.subarray(fileEnd + closingBoundary.length);
  if (suffix.length !== 0 && !suffix.equals(Buffer.from("\r\n", "ascii"))) {
    throw new EvidenceApiError(400, "INVALID_MULTIPART", "The multipart body is malformed.");
  }

  const bytes = body.subarray(fileStart, fileEnd);
  if (bytes.length > MAX_FILE_BYTES) {
    throw new EvidenceApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the 2 MiB limit.");
  }

  return { bytes, contentType, filename };
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown
): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

export function sendError(response: ServerResponse, error: EvidenceApiError): void {
  sendJson(response, error.statusCode, {
    error: { code: error.code, message: error.message },
  });
}
