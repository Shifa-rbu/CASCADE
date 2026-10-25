export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type SupportedMediaType = "application/pdf" | "image/png";

export interface EvidenceMetadata {
  version: 1;
  fileDigest: `0x${string}`;
  byteLength: number;
  mediaType: SupportedMediaType;
  uploadedAt: string;
}

export interface EvidenceResponse {
  evidenceId: string;
  fileDigest: `0x${string}`;
  status: "FILE_DIGEST_RECORDED";
  signatureStatus: "UNVERIFIED";
  duplicateStatus: "UNVERIFIED";
  reasonCodes: string[];
  byteLength: number;
  mediaType: SupportedMediaType;
}

export class EvidenceApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    statusCode: number,
    code: string,
    message: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "EvidenceApiError";
  }
}
