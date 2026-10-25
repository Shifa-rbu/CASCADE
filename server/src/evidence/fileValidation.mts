import { createHash } from "node:crypto";
import { EvidenceApiError, MAX_FILE_BYTES } from "./evidenceTypes.mts";
import type { SupportedMediaType } from "./evidenceTypes.mts";

const FILE_SIGNATURES: ReadonlyArray<{
  mediaType: SupportedMediaType;
  signature: Buffer;
}> = [
  { mediaType: "application/pdf", signature: Buffer.from("%PDF-", "ascii") },
  {
    mediaType: "image/png",
    signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
];

const EXTENSIONS: Record<SupportedMediaType, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
};

export function validateEvidenceFile(
  bytes: Buffer,
  declaredMediaType: string | undefined,
  filename: string | undefined
): SupportedMediaType {
  if (bytes.length === 0) {
    throw new EvidenceApiError(400, "EMPTY_FILE", "The uploaded file is empty.");
  }

  if (bytes.length > MAX_FILE_BYTES) {
    throw new EvidenceApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the 2 MiB limit.");
  }

  const detected = FILE_SIGNATURES.find(({ signature }) =>
    bytes.subarray(0, signature.length).equals(signature)
  );
  if (!detected) {
    throw new EvidenceApiError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "Only synthetic PDF and PNG evidence files are supported."
    );
  }

  if (
    declaredMediaType &&
    declaredMediaType !== "application/octet-stream" &&
    declaredMediaType.toLowerCase() !== detected.mediaType
  ) {
    throw new EvidenceApiError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "The declared content type does not match the uploaded file."
    );
  }

  if (filename) {
    const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
    if (extension && extension !== EXTENSIONS[detected.mediaType]) {
      throw new EvidenceApiError(
        415,
        "UNSUPPORTED_FILE_TYPE",
        "The filename extension does not match the uploaded file."
      );
    }
  }

  return detected.mediaType;
}

export function digestEvidenceFile(bytes: Buffer): `0x${string}` {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}
