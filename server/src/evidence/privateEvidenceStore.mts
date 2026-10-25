import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { EvidenceApiError } from "./evidenceTypes.mts";
import type { EvidenceMetadata } from "./evidenceTypes.mts";

export function getDefaultStorageDirectory(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error("LOCALAPPDATA is required for private evidence storage on Windows.");
    }
    return join(localAppData, "CASCADE", "evidence");
  }

  const dataHome = process.env.XDG_DATA_HOME;
  return dataHome
    ? join(dataHome, "cascade", "evidence")
    : join(homedir(), ".local", "share", "cascade", "evidence");
}

export class PrivateEvidenceStore {
  readonly directory: string;

  constructor(directory = getDefaultStorageDirectory()) {
    this.directory = directory;
  }

  async save(bytes: Buffer, metadata: Omit<EvidenceMetadata, "version">): Promise<string> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmodDirectoryPrivate(this.directory);

    const evidenceId = randomUUID();
    const dataPath = join(this.directory, `${evidenceId}.bin`);
    const metadataPath = join(this.directory, `${evidenceId}.json`);

    try {
      await writeFile(dataPath, bytes, { flag: "wx", mode: 0o600 });
      await writeFile(
        metadataPath,
        JSON.stringify({ version: 1, ...metadata } satisfies EvidenceMetadata),
        { flag: "wx", mode: 0o600 }
      );
      return evidenceId;
    } catch (error) {
      await Promise.all([
        rm(dataPath, { force: true }),
        rm(metadataPath, { force: true }),
      ]);
      throw error;
    }
  }

  async getMetadata(evidenceId: string): Promise<EvidenceMetadata> {
    try {
      const serialized = await readFile(join(this.directory, `${evidenceId}.json`), "utf8");
      const metadata: unknown = JSON.parse(serialized);
      if (!isEvidenceMetadata(metadata)) {
        throw new Error("Stored evidence metadata is invalid.");
      }
      return metadata;
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new EvidenceApiError(404, "EVIDENCE_NOT_FOUND", "Evidence was not found.");
      }
      throw error;
    }
  }
}

async function chmodDirectoryPrivate(directory: string): Promise<void> {
  if (process.platform !== "win32") {
    const { chmod } = await import("node:fs/promises");
    await chmod(directory, 0o700);
  }
}

function isEvidenceMetadata(value: unknown): value is EvidenceMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Record<string, unknown>;
  return (
    metadata.version === 1 &&
    typeof metadata.fileDigest === "string" &&
    /^0x[0-9a-f]{64}$/.test(metadata.fileDigest) &&
    typeof metadata.byteLength === "number" &&
    Number.isSafeInteger(metadata.byteLength) &&
    metadata.byteLength > 0 &&
    (metadata.mediaType === "application/pdf" || metadata.mediaType === "image/png") &&
    typeof metadata.uploadedAt === "string" &&
    !Number.isNaN(Date.parse(metadata.uploadedAt))
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
