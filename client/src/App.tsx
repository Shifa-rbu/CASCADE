import { useCallback, useEffect, useState } from "react";
import {
  getEscrowConfiguration,
  submitEvidenceProposal,
} from "./contract";
import {
  connectInjectedWallet,
  formatWalletError,
  getInjectedWallet,
  getProviderErrorCode,
  getTargetChainName,
  parseWalletChainId,
  readInjectedWallet,
  shortenWalletAddress,
  switchToTargetChain,
  TARGET_CHAIN_ID,
} from "./wallet";
import type { Eip1193Provider, WalletConnection } from "./wallet";

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

type ProposalTransaction =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "pending"; hash: `0x${string}` }
  | {
      status: "confirmed";
      hash: `0x${string}`;
      proposalId: string;
      heldForReview: boolean;
    }
  | { status: "failed"; message: string; hash?: `0x${string}` };

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
  const [walletProvider, setWalletProvider] = useState<Eip1193Provider | null>(null);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [proposalAmount, setProposalAmount] = useState("0.01");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalTransaction, setProposalTransaction] =
    useState<ProposalTransaction>({ status: "idle" });

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

  useEffect(() => {
    const provider = walletProvider ?? getInjectedWallet();
    if (!provider) return;

    if (walletProvider !== provider) setWalletProvider(provider);

    let active = true;
    const refreshWallet = async () => {
      try {
        const connection = await readInjectedWallet(provider);
        if (active) {
          setWallet(connection);
          setWalletError(null);
        }
      } catch (caught) {
        if (active) setWalletError(formatWalletError(caught));
      }
    };
    const handleAccountsChanged = () => {
      void refreshWallet();
    };
    const handleChainChanged = (chainId: unknown) => {
      try {
        const nextChainId = parseWalletChainId(chainId);
        setWallet((current) =>
          current ? { ...current, chainId: nextChainId } : current,
        );
        setWalletError(null);
      } catch (caught) {
        setWalletError(formatWalletError(caught));
      }
    };

    void refreshWallet();
    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);
    return () => {
      active = false;
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [walletProvider]);

  async function handleConnectWallet() {
    const provider = walletProvider ?? getInjectedWallet();
    if (!provider) {
      setWalletError("No browser wallet was detected. Install or enable a wallet extension, then reload this page.");
      return;
    }

    setWalletBusy(true);
    setWalletError(null);
    try {
      const connection = await connectInjectedWallet(provider);
      setWalletProvider(provider);
      setWallet(connection);
    } catch (caught) {
      const rejected = getProviderErrorCode(caught) === 4001;
      setWalletError(formatWalletError(caught));
      if (rejected) setWallet(null);
    } finally {
      setWalletBusy(false);
    }
  }

  async function handleSwitchNetwork() {
    if (!walletProvider) return;

    setWalletBusy(true);
    setWalletError(null);
    try {
      await switchToTargetChain(walletProvider);
      const connection = await readInjectedWallet(walletProvider);
      if (connection) {
        setWallet(connection);
        if (connection.chainId !== TARGET_CHAIN_ID) {
          setWalletError(`The wallet is still on a different network. Select ${getTargetChainName()} (${TARGET_CHAIN_ID}) in your wallet.`);
        }
      }
    } catch (caught) {
      setWalletError(formatWalletError(caught));
    } finally {
      setWalletBusy(false);
    }
  }

  async function submitOnChainProposal() {
    if (!wallet || !walletProvider || !record) return;

    setProposalBusy(true);
    setProposalTransaction({ status: "preparing" });
    try {
      const config = getEscrowConfiguration();
      if (!config) {
        throw new Error("No escrow contract is configured. Follow the local deployment steps in the README, then restart the client.");
      }
      if (wallet.chainId !== config.chainId) {
        throw new Error(`Wrong network. Select chain ${config.chainId} in your wallet and try again.`);
      }

      const submission = await submitEvidenceProposal({
        provider: walletProvider,
        account: wallet.account,
        config,
        digest: record.fileDigest,
        amountEth: proposalAmount,
        onSubmitted: (hash) => setProposalTransaction({ status: "pending", hash }),
      });
      setProposalTransaction({
        status: "confirmed",
        hash: submission.hash,
        proposalId: submission.proposalId,
        heldForReview: submission.heldForReview,
      });
    } catch (caught) {
      const hash =
        typeof caught === "object" &&
        caught !== null &&
        "transactionHash" in caught &&
        typeof caught.transactionHash === "string" &&
        /^0x[0-9a-f]{64}$/i.test(caught.transactionHash)
          ? caught.transactionHash as `0x${string}`
          : undefined;
      setProposalTransaction({
        status: "failed",
        message: formatWalletError(caught),
        ...(hash ? { hash } : {}),
      });
    } finally {
      setProposalBusy(false);
    }
  }

  async function uploadDemoEvidence() {
    setBusy(true);
    setError(null);
    setRecord(null);
    setProposalTransaction({ status: "idle" });

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

      <section className="wallet-card" aria-labelledby="wallet-title">
        <div className="wallet-copy">
          <p className="eyebrow">BROWSER WALLET</p>
          <h2 id="wallet-title">
            {wallet
              ? "Wallet connected"
              : "Connect your wallet"}
          </h2>
          <p>
            {wallet
              ? `${shortenWalletAddress(wallet.account)} · ${
                  wallet.chainId === TARGET_CHAIN_ID
                    ? `${getTargetChainName()} · ${wallet.chainId}`
                    : `Wrong network · expected ${getTargetChainName()} (${TARGET_CHAIN_ID})`
                }`
              : "Connect through your wallet extension. This only shares your public address; it does not sign or send a transaction."}
          </p>
        </div>
        {wallet ? (
          wallet.chainId === TARGET_CHAIN_ID ? (
            <span className="wallet-network wallet-network-ready">
              {getTargetChainName()} · {TARGET_CHAIN_ID}
            </span>
          ) : (
            <button
              className="secondary-button"
              type="button"
              onClick={handleSwitchNetwork}
              disabled={walletBusy}
            >
              {walletBusy ? "Waiting for wallet..." : `Switch to ${getTargetChainName()}`}
            </button>
          )
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={handleConnectWallet}
            disabled={walletBusy}
          >
            {walletBusy ? "Check your wallet..." : "Connect wallet"}
          </button>
        )}
        {walletError && (
          <p className="wallet-error" role="alert">
            {walletError}
          </p>
        )}
      </section>

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
              a document is authentic. Signature and duplicate status from
              the API remain UNVERIFIED.
            </p>

            <section className="proposal-panel" aria-labelledby="proposal-title">
              <p className="eyebrow">OPTIONAL WALLET ACTION</p>
              <h3 id="proposal-title">Submit a synthetic spend proposal</h3>
              <p className="body-copy">
                This signs a proposal using the digest above and asks your
                wallet to submit it to the configured contract. The transaction
                will not pay funds; a new proposal reserves demo campaign
                balance until it is cancelled or reviewed.
              </p>
              <p className="contract-target">
                Target: {getTargetChainName()} ({TARGET_CHAIN_ID}) · Contract:{" "}
                <code>{import.meta.env?.VITE_ESCROW_ADDRESS || "Not configured"}</code>
              </p>
              <label className="amount-label" htmlFor="proposal-amount">
                Proposal amount (test ETH)
              </label>
              <input
                id="proposal-amount"
                className="amount-input"
                type="number"
                min="0.000000000000000001"
                step="0.001"
                value={proposalAmount}
                onChange={(event) => setProposalAmount(event.target.value)}
                disabled={proposalBusy}
              />
              <button
                className="primary-button"
                type="button"
                onClick={submitOnChainProposal}
                disabled={
                  proposalBusy ||
                  !wallet ||
                  !walletProvider ||
                  wallet.chainId !== TARGET_CHAIN_ID
                }
              >
                {proposalBusy ? "Waiting for wallet and receipt..." : "Sign and submit proposal"}
              </button>
              {!wallet ? (
                <p className="button-hint">Connect a wallet before submitting.</p>
              ) : wallet.chainId !== TARGET_CHAIN_ID ? (
                <p className="button-hint">
                  Switch to {getTargetChainName()} ({TARGET_CHAIN_ID}) first.
                </p>
              ) : (
                <p className="button-hint">
                  No transaction is sent until you approve it in your wallet.
                </p>
              )}
              {proposalTransaction.status !== "idle" && (
                <div
                  className={`proposal-status proposal-${proposalTransaction.status}`}
                  role={proposalTransaction.status === "failed" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {proposalTransaction.status === "preparing" && (
                    <p>Preparing the typed-data signature request...</p>
                  )}
                  {proposalTransaction.status === "pending" && (
                    <>
                      <p>Transaction submitted; waiting for confirmation.</p>
                      <TransactionHash
                        hash={proposalTransaction.hash}
                        chainId={TARGET_CHAIN_ID}
                      />
                    </>
                  )}
                  {proposalTransaction.status === "confirmed" && (
                    <>
                      <p>
                        Transaction confirmed. Proposal #{proposalTransaction.proposalId}{" "}
                        {proposalTransaction.heldForReview
                          ? "was held for duplicate review."
                          : "is reserved and awaits approvals."}
                      </p>
                      <TransactionHash
                        hash={proposalTransaction.hash}
                        chainId={TARGET_CHAIN_ID}
                      />
                    </>
                  )}
                  {proposalTransaction.status === "failed" && (
                    <>
                      <p>Proposal attempt did not complete: {proposalTransaction.message}</p>
                      {proposalTransaction.hash && (
                        <TransactionHash
                          hash={proposalTransaction.hash}
                          chainId={TARGET_CHAIN_ID}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      <section className="limits-card" aria-labelledby="limits-title">
        <div className="limits-icon" aria-hidden="true">i</div>
        <div>
          <h2 id="limits-title">What this demo does (and does not do)</h2>
          <p>
            It uploads generated synthetic bytes to the local API and checks
            the SHA-256 digest. An optional proposal uses a real wallet
            signature and transaction on the configured chain. Contract
            duplicate checks cover exact digest bytes only; re-scanned
            documents and invoice authenticity are not verified.
          </p>
        </div>
      </section>

      <footer className="page-footer">
        CASCADE local demo <span aria-hidden="true">·</span> Synthetic data only
      </footer>
    </main>
  );
}

function TransactionHash({
  hash,
  chainId,
}: {
  hash: `0x${string}`;
  chainId: number;
}) {
  return (
    <p className="transaction-hash">
      Transaction: <code>{hash}</code>
      {chainId === 80_002 && (
        <>
          {" "}
          <a
            href={`https://amoy.polygonscan.com/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Polygon Amoy Polygonscan
          </a>
        </>
      )}
    </p>
  );
}
