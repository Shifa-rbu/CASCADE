import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createEvidenceApiServer } from "../../src/server.mts";
import { PrivateEvidenceStore } from "../../src/evidence/privateEvidenceStore.mts";
import { MAX_FILE_BYTES } from "../../src/evidence/evidenceTypes.mts";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);
const PDF_BYTES = Buffer.from("%PDF-1.7\nsynthetic test invoice\n%%EOF", "ascii");

describe("synthetic evidence API", () => {
  let storageDirectory: string;
  let server: ReturnType<typeof createEvidenceApiServer>;
  let baseUrl: string;

  beforeEach(async () => {
    storageDirectory = await mkdtemp(join(tmpdir(), "cascade-evidence-test-"));
    server = createEvidenceApiServer(new PrivateEvidenceStore(storageDirectory));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(storageDirectory, { recursive: true, force: true });
  });

  it("accepts a synthetic PDF, records its exact-byte digest, and exposes only safe fields", async () => {
    const response = await uploadFile("synthetic-invoice.pdf", PDF_BYTES, "application/pdf");
    assert.equal(response.status, 201);
    const value = await response.json();
    assert.equal(value.status, "FILE_DIGEST_RECORDED");
    assert.equal(value.signatureStatus, "UNVERIFIED");
    assert.equal(value.duplicateStatus, "UNVERIFIED");
    assert.equal(
      value.fileDigest,
      `0x${createHash("sha256").update(PDF_BYTES).digest("hex")}`
    );
    assert.equal(value.byteLength, PDF_BYTES.length);
    assert.equal(value.mediaType, "application/pdf");
    assert.match(value.evidenceId, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(
      Object.keys(value).sort(),
      [
        "byteLength",
        "duplicateStatus",
        "evidenceId",
        "fileDigest",
        "mediaType",
        "reasonCodes",
        "signatureStatus",
        "status",
      ].sort()
    );
    assert.equal(JSON.stringify(value).includes("synthetic-invoice.pdf"), false);
    assert.equal(JSON.stringify(value).includes(storageDirectory), false);

    const statusResponse = await fetch(`${baseUrl}/api/v1/evidence/${value.evidenceId}/status`);
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(await statusResponse.json(), value);

    const files = await readdir(storageDirectory);
    assert.deepEqual(files.sort(), [`${value.evidenceId}.bin`, `${value.evidenceId}.json`].sort());
    assert.deepEqual(await readFile(join(storageDirectory, `${value.evidenceId}.bin`)), PDF_BYTES);
    const metadata = JSON.parse(
      await readFile(join(storageDirectory, `${value.evidenceId}.json`), "utf8")
    );
    assert.deepEqual(Object.keys(metadata).sort(), [
      "byteLength",
      "fileDigest",
      "mediaType",
      "uploadedAt",
      "version",
    ]);
    if (process.platform !== "win32") {
      assert.equal((await stat(storageDirectory)).mode & 0o777, 0o700);
      assert.equal((await stat(join(storageDirectory, `${value.evidenceId}.bin`))).mode & 0o777, 0o600);
    }
  });

  it("detects PNG bytes from their signature and produces a different digest after a byte changes", async () => {
    const first = await uploadFile("evidence.png", PNG_BYTES, "image/png");
    assert.equal(first.status, 201);
    const firstValue = await first.json();

    const alteredBytes = Buffer.from(PNG_BYTES);
    alteredBytes[alteredBytes.length - 1] ^= 0xff;
    const second = await uploadFile("evidence.png", alteredBytes, "image/png");
    assert.equal(second.status, 201);
    const secondValue = await second.json();

    assert.equal(firstValue.mediaType, "image/png");
    assert.notEqual(firstValue.fileDigest, secondValue.fileDigest);
  });

  it("rejects missing, empty, malformed, unsupported, and oversized uploads", async () => {
    const missing = await fetch(`${baseUrl}/api/v1/evidence`, { method: "POST" });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error.code, "INVALID_MULTIPART");

    const empty = await uploadFile("empty.pdf", Buffer.alloc(0), "application/pdf");
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error.code, "EMPTY_FILE");

    const malformed = await fetch(`${baseUrl}/api/v1/evidence`, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=bad" },
      body: Buffer.from("not-multipart"),
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_MULTIPART");

    const extraFieldBody = multipartBody([
      { name: "metadata", value: Buffer.from("private invoice information") },
      {
        name: "file",
        filename: "invoice.pdf",
        mediaType: "application/pdf",
        value: PDF_BYTES,
      },
    ]);
    const extraField = await fetch(`${baseUrl}/api/v1/evidence`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${extraFieldBody.boundary}` },
      body: extraFieldBody.body,
    });
    assert.equal(extraField.status, 400);
    assert.equal((await extraField.json()).error.code, "INVALID_MULTIPART");

    const unsupported = await uploadFile(
      "invoice.txt",
      Buffer.from("not an invoice"),
      "text/plain"
    );
    assert.equal(unsupported.status, 415);
    assert.equal((await unsupported.json()).error.code, "UNSUPPORTED_FILE_TYPE");

    const tooLarge = await uploadFile(
      "large.pdf",
      Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(MAX_FILE_BYTES)]),
      "application/pdf"
    );
    assert.equal(tooLarge.status, 413);
    assert.equal((await tooLarge.json()).error.code, "FILE_TOO_LARGE");
  });

  it("rejects a declared type or filename extension that conflicts with detected bytes", async () => {
    const wrongContentType = await uploadFile("invoice.pdf", PDF_BYTES, "image/png");
    assert.equal(wrongContentType.status, 415);

    const wrongExtension = await uploadFile("invoice.png", PDF_BYTES, "application/pdf");
    assert.equal(wrongExtension.status, 415);
  });

  it("returns safe not-found and route errors without leaking internal paths", async () => {
    const missing = await fetch(
      `${baseUrl}/api/v1/evidence/00000000-0000-4000-8000-000000000000/status`
    );
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, "EVIDENCE_NOT_FOUND");

    const invalidId = await fetch(`${baseUrl}/api/v1/evidence/not-an-id/status`);
    assert.equal(invalidId.status, 404);
    assert.equal((await invalidId.json()).error.code, "NOT_FOUND");

    const health = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", service: "evidence-api" });

    const routes = await fetch(`${baseUrl}/api/v1/release`);
    assert.equal(routes.status, 404);
    const error = await routes.text();
    assert.equal(error.includes(storageDirectory), false);
    assert.equal(error.includes("stack"), false);
  });

  async function uploadFile(
    filename: string,
    bytes: Buffer,
    mediaType: string
  ): Promise<Response> {
    const multipart = multipartBody([
      { name: "file", filename, mediaType, value: bytes },
    ]);
    return fetch(`${baseUrl}/api/v1/evidence`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${multipart.boundary}` },
      body: multipart.body,
    });
  }
});

function multipartBody(
  parts: Array<{
    name: string;
    value: Buffer;
    filename?: string;
    mediaType?: string;
  }>
): { boundary: string; body: Buffer } {
  const boundary = `cascade-test-${randomUUID()}`;
  const chunks: Buffer[] = [];

  for (const part of parts) {
    const filename = part.filename ? `; filename="${part.filename}"` : "";
    const mediaType = part.mediaType ? `Content-Type: ${part.mediaType}\r\n` : "";
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${filename}\r\n${mediaType}\r\n`,
        "ascii"
      ),
      part.value,
      Buffer.from("\r\n", "ascii")
    );
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "ascii"));
  return { boundary, body: Buffer.concat(chunks) };
}
