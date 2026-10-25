import { useRef, useState } from "react";
import {
  EvidenceApiError,
  getEvidenceStatus,
  isSupportedEvidenceFile,
  MAX_EVIDENCE_BYTES,
  uploadEvidence,
  type EvidenceApiRecord,
} from "./evidenceApi";

export interface EvidencePanelProps {
  apiBaseUrl?: string;
}

const maxSizeLabel = "2 MiB";

function fileError(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  const hasSupportedType =
    file.type === "application/pdf" ||
    file.type === "image/png" ||
    (!file.type && (extension === "pdf" || extension === "png"));
  if (!hasSupportedType) {
    return "Select a synthetic PDF or PNG evidence file.";
  }
  return file.size > MAX_EVIDENCE_BYTES
    ? `Evidence files must be ${maxSizeLabel} or smaller.`
    : "Evidence file is empty.";
}

export function EvidencePanel({ apiBaseUrl }: EvidencePanelProps) {
  const [record, setRecord] = useState<EvidenceApiRecord>();
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const uploadVersionRef = useRef(0);

  const chooseFile = (candidate: File | undefined) => {
    setError(undefined);
    setMessage(undefined);
    setProgress(undefined);
    setRecord(undefined);
    setIsBusy(false);
    uploadVersionRef.current += 1;
    if (!candidate) {
      setFile(undefined);
      return;
    }
    if (!isSupportedEvidenceFile(candidate)) {
      setFile(undefined);
      setError(fileError(candidate));
      return;
    }
    setFile(candidate);
  };

  const upload = async () => {
    if (!apiBaseUrl) {
      setError("Evidence API base URL is not configured.");
      return;
    }
    if (!file) {
      setError("Select a synthetic PDF or PNG before uploading.");
      return;
    }
    setIsBusy(true);
    setError(undefined);
    setMessage(undefined);
    setRecord(undefined);
    const uploadVersion = ++uploadVersionRef.current;
    try {
      const nextRecord = await uploadEvidence(apiBaseUrl, file, ({ loaded, total }) => {
        if (uploadVersion !== uploadVersionRef.current) return;
        setProgress(total ? Math.round((loaded / total) * 100) : undefined);
      });
      if (uploadVersion !== uploadVersionRef.current) return;
      setRecord(nextRecord);
      setMessage("Evidence upload succeeded according to the API response.");
    } catch (uploadError) {
      if (uploadVersion !== uploadVersionRef.current) return;
      setError(uploadError instanceof Error ? uploadError.message : "Evidence upload failed.");
    } finally {
      if (uploadVersion === uploadVersionRef.current) {
        setIsBusy(false);
      }
    }
  };

  const refresh = async () => {
    if (!apiBaseUrl || !record?.evidenceId) {
      setError("Upload evidence before refreshing its status.");
      return;
    }
    setIsBusy(true);
    setError(undefined);
    const evidenceId = record.evidenceId;
    const statusVersion = ++uploadVersionRef.current;
    try {
      const nextRecord = await getEvidenceStatus(apiBaseUrl, evidenceId);
      if (
        statusVersion !== uploadVersionRef.current ||
        record?.evidenceId !== evidenceId
      ) {
        return;
      }
      setRecord(nextRecord);
      setMessage("Evidence status refreshed from the API.");
    } catch (statusError) {
      if (statusVersion !== uploadVersionRef.current) return;
      setError(statusError instanceof EvidenceApiError ? statusError.message : "Evidence status refresh failed.");
    } finally {
      if (statusVersion === uploadVersionRef.current) {
        setIsBusy(false);
      }
    }
  };

  return (
    <section className="ngo-card" aria-labelledby="evidence-api-heading">
      <div className="ngo-section-heading">
        <div>
          <p className="ngo-eyebrow">Backend 2 evidence service</p>
          <h2 id="evidence-api-heading">Upload synthetic evidence</h2>
        </div>
        <span className="ngo-badge ngo-badge-demo">API data</span>
      </div>
      <p className="ngo-help">
        PDF and PNG only, up to {maxSizeLabel}. The digest is a hash of uploaded
        bytes, not proof that an invoice is genuine. Signature and duplicate
        results remain unverified by this API.
      </p>
      <div className="ngo-form">
        <label htmlFor="ngo-evidence-file">
          Synthetic PDF or PNG
          <input
            id="ngo-evidence-file"
            type="file"
            accept="application/pdf,image/png"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
        </label>
        {file && (
          <p className="ngo-help">
            Synthetic evidence selected. The API remains authoritative for
            content type and digest recording.
          </p>
        )}
        {progress !== undefined && <p className="ngo-muted" aria-live="polite">Upload progress: {progress}%</p>}
        <div className="ngo-row">
          <button className="ngo-button" type="button" onClick={() => void upload()} disabled={isBusy || !file || !apiBaseUrl}>
            {isBusy ? "Working..." : "Upload evidence"}
          </button>
          <button className="ngo-button ngo-button-secondary" type="button" onClick={() => void refresh()} disabled={isBusy || !record}>
            Refresh status
          </button>
        </div>
        {!apiBaseUrl && <p className="ngo-warning">Configure the API base URL and a same-origin proxy or CORS policy before browser upload.</p>}
        {error && <p className="ngo-error" role="alert">{error}</p>}
        {message && <p className="ngo-success" aria-live="polite">{message}</p>}
      </div>
      {record && <EvidenceRecord record={record} />}
    </section>
  );
}

function EvidenceRecord({ record }: { record: EvidenceApiRecord }) {
  return (
    <div className="ngo-evidence ngo-api-record" aria-live="polite">
      <h3>API response</h3>
      <dl>
        <div><dt>Evidence ID</dt><dd>{record.evidenceId}</dd></div>
        <div><dt>File digest</dt><dd className="ngo-mono">{record.fileDigest}</dd></div>
        <div><dt>Record status</dt><dd>{record.status}</dd></div>
        <div><dt>Signature status</dt><dd>{record.signatureStatus}</dd></div>
        <div><dt>Duplicate status</dt><dd>{record.duplicateStatus}</dd></div>
        <div><dt>Media type / size</dt><dd>{record.mediaType} / {record.byteLength} bytes</dd></div>
        <div><dt>Reason codes</dt><dd>{record.reasonCodes.length ? record.reasonCodes.join(", ") : "None returned"}</dd></div>
      </dl>
      <p className="ngo-help">This response records uploaded bytes; it does not authenticate the underlying document or establish contract duplicate state.</p>
    </div>
  );
}
