export const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^0x[0-9a-f]{64}$/i;
const SUPPORTED_MEDIA_TYPES = new Set(["application/pdf", "image/png"]);

export interface EvidenceApiRecord {
  evidenceId: string;
  fileDigest: string;
  status: "FILE_DIGEST_RECORDED";
  signatureStatus: "UNVERIFIED";
  duplicateStatus: "UNVERIFIED";
  reasonCodes: string[];
  byteLength: number;
  mediaType: "application/pdf" | "image/png";
}

export interface EvidenceUploadProgress {
  loaded: number;
  total: number;
}

export class EvidenceApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "EvidenceApiError";
    this.status = status;
  }
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function safeRecord(value: unknown): EvidenceApiRecord {
  if (!value || typeof value !== "object") {
    throw new EvidenceApiError("Evidence API returned an invalid response.");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.evidenceId !== "string" ||
    !isUuid(record.evidenceId) ||
    typeof record.fileDigest !== "string" ||
    !DIGEST_PATTERN.test(record.fileDigest) ||
    record.status !== "FILE_DIGEST_RECORDED" ||
    record.signatureStatus !== "UNVERIFIED" ||
    record.duplicateStatus !== "UNVERIFIED" ||
    typeof record.mediaType !== "string" ||
    !SUPPORTED_MEDIA_TYPES.has(record.mediaType)
  ) {
    throw new EvidenceApiError("Evidence API response is missing safe evidence fields.");
  }
  const byteLength = record.byteLength;
  if (
    typeof byteLength !== "number" ||
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0 ||
    byteLength > MAX_EVIDENCE_BYTES
  ) {
    throw new EvidenceApiError("Evidence API returned an invalid byte length.");
  }
  if (!Array.isArray(record.reasonCodes)) {
    throw new EvidenceApiError("Evidence API response is missing reason codes.");
  }
  if (!record.reasonCodes.every((code): code is string => typeof code === "string")) {
    throw new EvidenceApiError("Evidence API returned invalid reason codes.");
  }
  const reasonCodes = record.reasonCodes;
  return {
    evidenceId: record.evidenceId as string,
    fileDigest: record.fileDigest as string,
    status: "FILE_DIGEST_RECORDED",
    signatureStatus: "UNVERIFIED",
    duplicateStatus: "UNVERIFIED",
    reasonCodes,
    byteLength,
    mediaType: record.mediaType as "application/pdf" | "image/png",
  };
}

function parseResponse(text: string): EvidenceApiRecord {
  try {
    return safeRecord(JSON.parse(text));
  } catch (error) {
    if (error instanceof EvidenceApiError) throw error;
    throw new EvidenceApiError("Evidence API returned invalid JSON.");
  }
}

export function isSupportedEvidenceFile(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  const mediaTypeIsSupported = SUPPORTED_MEDIA_TYPES.has(file.type);
  const missingMediaTypeHasSupportedExtension =
    !file.type && (extension === "pdf" || extension === "png");
  return (
    (mediaTypeIsSupported || missingMediaTypeHasSupportedExtension) &&
    file.size > 0 &&
    file.size <= MAX_EVIDENCE_BYTES
  );
}

export function uploadEvidence(
  baseUrl: string,
  file: File,
  onProgress?: (progress: EvidenceUploadProgress) => void,
): Promise<EvidenceApiRecord> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint(baseUrl, "/api/v1/evidence"));
    request.timeout = 30_000;
    request.responseType = "text";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.({ loaded: event.loaded, total: event.total });
      }
    };
    request.onerror = () => reject(new EvidenceApiError("Evidence upload could not reach the API."));
    request.ontimeout = () => reject(new EvidenceApiError("Evidence upload timed out."));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new EvidenceApiError(`Evidence upload failed with HTTP ${request.status}.`, request.status));
        return;
      }
      try {
        resolve(parseResponse(request.responseText));
      } catch (error) {
        reject(error);
      }
    };
    const formData = new FormData();
    formData.append("file", file);
    request.send(formData);
  });
}

export async function getEvidenceStatus(baseUrl: string, evidenceId: string) {
  const response = await fetch(endpoint(baseUrl, `/api/v1/evidence/${encodeURIComponent(evidenceId)}/status`));
  const text = await response.text();
  if (!response.ok) {
    throw new EvidenceApiError(`Evidence status failed with HTTP ${response.status}.`, response.status);
  }
  return parseResponse(text);
}
