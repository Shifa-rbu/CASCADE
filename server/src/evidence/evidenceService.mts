import { EvidenceApiError } from "./evidenceTypes.mts";
import type { EvidenceResponse } from "./evidenceTypes.mts";
import { digestEvidenceFile, validateEvidenceFile } from "./fileValidation.mts";
import { PrivateEvidenceStore } from "./privateEvidenceStore.mts";

export class EvidenceService {
  private readonly store: PrivateEvidenceStore;

  constructor(store: PrivateEvidenceStore) {
    this.store = store;
  }

  async upload(
    bytes: Buffer,
    declaredMediaType: string | undefined,
    filename: string | undefined
  ): Promise<EvidenceResponse> {
    const mediaType = validateEvidenceFile(bytes, declaredMediaType, filename);
    const evidenceId = await this.store.save(bytes, {
      fileDigest: digestEvidenceFile(bytes),
      byteLength: bytes.length,
      mediaType,
      uploadedAt: new Date().toISOString(),
    });
    return this.toPublicResponse(evidenceId, await this.store.getMetadata(evidenceId));
  }

  async getStatus(evidenceId: string): Promise<EvidenceResponse> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidenceId)) {
      throw new EvidenceApiError(404, "EVIDENCE_NOT_FOUND", "Evidence was not found.");
    }
    return this.toPublicResponse(evidenceId, await this.store.getMetadata(evidenceId));
  }

  private toPublicResponse(
    evidenceId: string,
    metadata: Awaited<ReturnType<PrivateEvidenceStore["getMetadata"]>>
  ): EvidenceResponse {
    return {
      evidenceId,
      fileDigest: metadata.fileDigest,
      status: "FILE_DIGEST_RECORDED",
      signatureStatus: "UNVERIFIED",
      duplicateStatus: "UNVERIFIED",
      reasonCodes: ["SIGNATURE_NOT_CHECKED", "CONTRACT_DUPLICATE_STATE_NOT_CHECKED"],
      byteLength: metadata.byteLength,
      mediaType: metadata.mediaType,
    };
  }
}
