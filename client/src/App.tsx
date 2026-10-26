import { useCallback, useEffect, useState } from "react";

type ApiHealth = "checking" | "online" | "offline";

interface EvidenceResponse {
  evidenceId: string;
  fileDigest: `0x${string}`;
  status: "FILE_DIGEST_RECORDED";
  signatureStatus: "UNVERIFIED";
  duplicateStatus: "UNVERIFIED";
  reasonCodes: string[];
  byteLength: number;
  mediaType: "application/pdf" | "image/png";
}

interface ApiError {
  error?: {
    code?: string;
    message?: string;
  };
}

function isEvidenceResponse(value: unknown): value is EvidenceResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<EvidenceResponse>;
  return (
    typeof response.evidenceId === "string" &&
    typeof response.fileDigest === "string" &&
    /^0x[0-9a-f]{64}$/.test(response.fileDigest) &&
    response.status === "FILE_DIGEST_RECORDED" &&
    response.signatureStatus === "UNVERIFIED" &&
    response.duplicateStatus === "UNVERIFIED" &&
    Array.isArray(response.reasonCodes) &&
    typeof response.byteLength === "number" &&
    response.mediaType === "application/pdf"
  );
}

function createSyntheticPdf(): Uint8Array {
  const encoder = new TextEncoder();
  const stream = "BT /F1 18 Tf 72 720 Td (CASCADE SYNTHETIC DEMO - NOT A REAL INVOICE) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(encoder.encode(document).length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const crossReferenceOffset = encoder.encode(document).length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF\n`;
  return encoder.encode(document);
}

async function sha256(bytes: Uint8Array): Promise<`0x${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `0x${hex}`;
}

async function responseError(response: Response): Promise<string> {
  let body: ApiError;
  try {
    body = (await response.json()) as ApiError;
  } catch {
    return `The evidence API returned HTTP ${response.status}.`;
  }
  return (
    body.error?.message ??
    `The evidence API returned HTTP ${response.status}.`
  );
}

export default function App() {
  const [apiHealth, setApiHealth] = useState<ApiHealth>("checking");
  const [record, setRecord] = useState<EvidenceResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkApi = useCallback(async () => {
    setApiHealth("checking");
    try {
      const response = await fetch("/api/v1/health");
      if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}.`);
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("status" in body) ||
        body.status !== "ok"
      ) {
        throw new Error("The evidence API returned an unexpected health response.");
      }
      setApiHealth("online");
    } catch {
      setApiHealth("offline");
    }
  }, []);

  useEffect(() => {
    void checkApi();
  }, [checkApi]);

  async function uploadDemoEvidence() {
    setBusy(true);
    setError(null);
    setRecord(null);

    try {
      const bytes = createSyntheticPdf();
      const clientDigest = await sha256(bytes);
      const file = new File([bytes], "cascade-synthetic-demo.pdf", {
        type: "application/pdf",
      });
      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/v1/evidence", {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error(await responseError(response));

      const body: unknown = await response.json();
      if (!isEvidenceResponse(body)) {
        throw new Error("The evidence API returned an invalid evidence record.");
      }
      if (body.fileDigest !== clientDigest) {
        throw new Error("The browser and API computed different file digests.");
      }
      setRecord(body);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The synthetic evidence upload failed unexpectedly.",
      );
      await checkApi();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="CASCADE home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>CASCADE</span>
        </a>
        <div className={`api-indicator api-${apiHealth}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {apiHealth === "checking"
            ? "Checking API"
            : apiHealth === "online"
              ? "Evidence API connected"
              : "Evidence API unavailable"}
        </div>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">SYNTHETIC DEMO</p>
        <h1 id="page-title">Evidence, made clear.</h1>
        <p className="hero-copy">
          See how a synthetic document is stored privately and assigned a
          consistent SHA-256 digest. No real invoice or personal information is
          used.
        </p>
      </section>

      <section className="demo-card" aria-labelledby="demo-title">
        <div className="card-heading">
          <div>
            <p className="eyebrow">SAFE TEST DATA</p>
            <h2 id="demo-title">Create a demo evidence record</h2>
          </div>
          <span className="demo-badge">DEMO ONLY</span>
        </div>

        <p className="body-copy">
          This button creates a small synthetic PDF in your browser and sends
          it to the local evidence API. The exact bytes are hashed in the
          browser and API; the results must match before a record is shown.
        </p>

        <button
          className="primary-button"
          type="button"
          onClick={uploadDemoEvidence}
          disabled={busy || apiHealth !== "online"}
        >
          {busy ? "Recording synthetic evidence..." : "Create demo record"}
        </button>
        <p className="button-hint">
          {apiHealth === "online"
            ? "Uses generated demo bytes only."
            : "Start the evidence API to enable this demo."}
        </p>

        {error && (
          <div className="alert alert-error" role="alert">
            <strong>Upload not completed</strong>
            <span>{error}</span>
          </div>
        )}

        {record && (
          <div className="result-panel" aria-live="polite">
            <div className="result-heading">
              <span className="success-mark" aria-hidden="true">✓</span>
              <div>
                <p className="eyebrow">DIGEST RECORDED</p>
                <h3>Browser and API digests match</h3>
              </div>
            </div>

            <dl className="record-grid">
              <div className="record-field record-field-wide">
                <dt>Evidence digest (SHA-256)</dt>
                <dd className="digest-value">{record.fileDigest}</dd>
              </div>
              <div className="record-field">
                <dt>Evidence ID</dt>
                <dd>{record.evidenceId}</dd>
              </div>
              <div className="record-field">
                <dt>File details</dt>
                <dd>{record.mediaType}, {record.byteLength} bytes</dd>
              </div>
              <div className="record-field">
                <dt>Signature verification</dt>
                <dd><span className="unverified-badge">{record.signatureStatus}</span></dd>
              </div>
              <div className="record-field">
                <dt>Contract duplicate check</dt>
                <dd><span className="unverified-badge">{record.duplicateStatus}</span></dd>
              </div>
            </dl>

            <p className="honesty-note">
              A matching digest identifies these bytes; it does not prove that
              a document is authentic. No wallet transaction or on-chain
              verification was performed.
            </p>
          </div>
        )}
      </section>

      <section className="limits-card" aria-labelledby="limits-title">
        <div className="limits-icon" aria-hidden="true">i</div>
        <div>
          <h2 id="limits-title">What this demo does (and does not do)</h2>
          <p>
            It uploads generated synthetic bytes to the local API and checks
            the SHA-256 digest. Vendor signatures, duplicate status, wallet
            connection, and contract transactions are not verified or
            simulated as successful.
          </p>
        </div>
      </section>

      <footer className="page-footer">
        CASCADE local demo <span aria-hidden="true">·</span> Synthetic data only
      </footer>
    </main>
  );
}
