import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ngoCampaign,
  ngoEvidence,
  ngoProposals,
  ngoReviewCases,
  type LocalDraftMock,
  type ProposalStatus,
  type SpendProposalMock,
} from "../../mocks/ngoData";
import { WalletStatus } from "../wallet";
import { EvidencePanel } from "./EvidencePanel";
import type {
  AmountConversion,
  ContractActionBoundary,
} from "../wallet";
import "../../styles/ngo.css";

export interface NGODashboardProps {
  contractActions?: ContractActionBoundary;
  amountConversion?: AmountConversion;
  expectedChainId?: number;
  evidenceApiBaseUrl?: string;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: ngoCampaign.currency,
});

function statusLabel(status: ProposalStatus) {
  if (status === "RELEASED") {
    return "demo release fixture (not contract-confirmed)";
  }
  return `${status.replaceAll("_", " ").toLowerCase()} (demo contract status)`;
}

function proposalStatusLabel(proposal: SpendProposalMock | LocalDraftMock) {
  return proposal.status === "LOCAL_DRAFT"
    ? "Local draft - nothing sent to the contract"
    : statusLabel(proposal.status);
}

function approvalCount(proposal: SpendProposalMock | LocalDraftMock) {
  return new Set(
    proposal.approvals
      .filter((approval) => approval.approved)
      .map((approval) => approval.address.trim().toLowerCase()),
  ).size;
}

export function NGODashboard({
  expectedChainId = ngoCampaign.chainId,
  evidenceApiBaseUrl,
}: NGODashboardProps) {
  const proposals = ngoProposals;
  const [drafts, setDrafts] = useState<LocalDraftMock[]>([]);
  const draftSequenceRef = useRef(0);
  const [selectedId, setSelectedId] = useState(ngoProposals[0]?.id);
  const [formError, setFormError] = useState<string>();
  const allProposals: Array<SpendProposalMock | LocalDraftMock> = [
    ...drafts,
    ...proposals,
  ];
  const selected = allProposals.find((proposal) => proposal.id === selectedId);
  const evidenceById = useMemo(
    () => new Map(ngoEvidence.map((item) => [item.id, item])),
    [],
  );

  const submitProposal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = Number(data.get("amount"));
    const category = String(data.get("category") || "").trim();
    const invoiceReference = String(data.get("invoiceReference") || "").trim();
    const evidenceId = String(data.get("evidenceId") || "").trim();
    if (!Number.isFinite(amount) || amount <= 0 || !category || !invoiceReference || !evidenceId) {
      setFormError("Complete every field with a finite positive amount and all required fields.");
      return;
    }
    draftSequenceRef.current += 1;
    const draft: LocalDraftMock = {
      id: `draft-local-${String(draftSequenceRef.current).padStart(3, "0")}`,
      status: "LOCAL_DRAFT",
      amount,
      category,
      invoiceReference,
      evidenceId,
      approvals: [],
      createdAt: new Date().toISOString(),
    };
    setDrafts((current) => [draft, ...current]);
    setSelectedId(draft.id);
    form.reset();
    setFormError(undefined);
  };

  return (
    <main className="ngo-shell">
      <header className="ngo-header">
        <div>
          <p className="ngo-eyebrow">CASCADE / NGO operations</p>
          <h1>Campaign finance workspace</h1>
          <p className="ngo-muted">
            Review campaign operations without editing contract history.
          </p>
        </div>
        <WalletStatus expectedChainId={expectedChainId} />
      </header>

      <section className="ngo-card ngo-summary" aria-labelledby="campaign-heading">
        <div className="ngo-section-heading">
          <div>
            <p className="ngo-eyebrow">Demo data</p>
            <h2 id="campaign-heading">{ngoCampaign.purpose}</h2>
          </div>
          <span className="ngo-badge ngo-badge-demo">Local mock campaign</span>
        </div>
        <dl className="ngo-metrics">
          <div>
            <dt>Allowed category</dt>
            <dd>{ngoCampaign.allowedCategory}</dd>
          </div>
          <div>
            <dt>Campaign cap (fixture)</dt>
            <dd>{money.format(ngoCampaign.cap)}</dd>
          </div>
          <div>
            <dt>Contract balance (fixture)</dt>
            <dd>{money.format(ngoCampaign.contractBalance)}</dd>
          </div>
          <div>
            <dt>Current tranche (fixture)</dt>
            <dd>
              {ngoCampaign.currentTranche} of {ngoCampaign.trancheCount}
            </dd>
          </div>
          <div>
            <dt>Contract campaign ID (fixture)</dt>
            <dd>{ngoCampaign.contractCampaignId.toString()}</dd>
          </div>
        </dl>
      </section>

      <div className="ngo-grid">
        <section className="ngo-card" aria-labelledby="proposal-form-heading">
          <div className="ngo-section-heading">
            <div>
              <p className="ngo-eyebrow">Demo / adapter boundary</p>
              <h2 id="proposal-form-heading">Propose a spend</h2>
            </div>
          </div>
          <form
            className="ngo-form"
            onSubmit={(event) => void submitProposal(event)}
            aria-describedby="proposal-help proposal-feedback"
          >
            <label htmlFor="ngo-amount">
              Amount ({ngoCampaign.currency}, fixture display)
              <input
                id="ngo-amount"
                name="amount"
                type="number"
                min="0.01"
                step="any"
                required
              />
            </label>
            <label htmlFor="ngo-category">
              Category
              <select
                id="ngo-category"
                name="category"
                defaultValue={ngoCampaign.allowedCategory}
                required
              >
                <option>{ngoCampaign.allowedCategory}</option>
              </select>
            </label>
            <label htmlFor="ngo-invoice">
              Invoice reference
              <input
                id="ngo-invoice"
                name="invoiceReference"
                placeholder="INV-DEMO-015"
                required
              />
            </label>
            <label htmlFor="ngo-evidence">
              Opaque evidence ID
              <input
                id="ngo-evidence"
                name="evidenceId"
                placeholder="evidence-demo-..."
                required
              />
            </label>
            <div id="proposal-feedback" aria-live="polite">
              {formError && (
                <p className="ngo-error" role="alert">
                  {formError}
                </p>
              )}
            </div>
            <button className="ngo-button" type="submit">
              Save local draft
            </button>
            <button
              className="ngo-button ngo-button-secondary"
              type="button"
              disabled
            >
              Real submission unavailable
            </button>
            <p className="ngo-help" id="proposal-help">
              Local drafts stay in component memory only. Nothing is sent to the
              wallet, API, or contract. Real submission remains disabled until
              signed evidence inputs and token conversion are supplied.
            </p>
          </form>
        </section>

        <section className="ngo-card" aria-labelledby="evidence-heading">
          <div className="ngo-section-heading">
            <div>
              <p className="ngo-eyebrow">Safe evidence fields</p>
              <h2 id="evidence-heading">Evidence status</h2>
            </div>
            <span className="ngo-badge ngo-badge-demo">Local demo</span>
          </div>
          <div className="ngo-stack">
            {ngoEvidence.map((evidence) => (
              <article className="ngo-evidence" key={evidence.id}>
                <div className="ngo-row">
                  <strong>{evidence.label}</strong>
                  <span
                    className={`ngo-badge ngo-status-${evidence.state.toLowerCase()}`}
                  >
                    {evidence.state}
                  </span>
                </div>
                <p>{evidence.detail}</p>
                <small>
                  {evidence.id} / updated{" "}
                  {new Date(evidence.updatedAt).toLocaleDateString()}
                </small>
              </article>
            ))}
          </div>
        </section>
      </div>

      <EvidencePanel apiBaseUrl={evidenceApiBaseUrl} />

      <section className="ngo-card" aria-labelledby="proposals-heading">
        <div className="ngo-section-heading">
          <div>
            <p className="ngo-eyebrow">Demo data</p>
            <h2 id="proposals-heading">Spend proposals</h2>
          </div>
          <span className="ngo-badge ngo-badge-demo">
            {allProposals.length} records ({drafts.length} local drafts)
          </span>
        </div>
        {allProposals.length === 0 ? (
          <p className="ngo-muted">No spend proposals have been recorded.</p>
        ) : (
          <div className="ngo-proposals">
            <ul className="ngo-list">
              {allProposals.map((proposal) => (
                <li key={proposal.id}>
                  <button
                    className={`ngo-list-item ${
                      proposal.id === selectedId ? "is-selected" : ""
                    }`}
                    type="button"
                    onClick={() => setSelectedId(proposal.id)}
                    aria-pressed={proposal.id === selectedId}
                  >
                    <span>
                      <strong>{proposal.invoiceReference}</strong>
                      <small>
                        {proposal.category} / {proposal.id}
                      </small>
                    </span>
                    <span>
                      <strong>{money.format(proposal.amount)}</strong>
                      <small>
                        {proposalStatusLabel(proposal)}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <ProposalDetails
                proposal={selected}
                evidenceLabel={evidenceById.get(selected.evidenceId)?.label}
              />
            )}
          </div>
        )}
      </section>

      <section className="ngo-card" aria-labelledby="review-heading">
        <div className="ngo-section-heading">
          <div>
            <p className="ngo-eyebrow">Exceptions</p>
            <h2 id="review-heading">Paused reviews</h2>
          </div>
        </div>
        {ngoReviewCases.map((review) => (
          <article className="ngo-review" key={review.id}>
            <div>
              <span className="ngo-badge ngo-status-paused_review">
                {review.status}
              </span>
              <h3>{review.reason}</h3>
              <p>Assigned reviewer: {review.assignedReviewer}</p>
              <p>
                Requested evidence: {review.requestedEvidence.join(" / ")}
              </p>
              <p>
                Resolution outcome: {review.outcome} (no resolution recorded)
              </p>
            </div>
            <div>
              <strong>Next action</strong>
              <p>{review.nextAction}</p>
              <button
                className="ngo-button ngo-button-secondary"
                type="button"
                disabled
              >
                New correction record unavailable
              </button>
              <p className="ngo-help">
                Corrections create a new event; prior contract history is never
                edited or deleted.
              </p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function ProposalDetails({
  proposal,
  evidenceLabel,
}: {
  proposal: SpendProposalMock | LocalDraftMock;
  evidenceLabel?: string;
}) {
  const approvals = approvalCount(proposal);
  const seen = new Set<string>();
  const transaction = "transaction" in proposal ? proposal.transaction : undefined;

  return (
    <aside className="ngo-details" aria-label={`Details for ${proposal.id}`}>
      <div className="ngo-row">
        <h3>{proposal.id}</h3>
        <span className="ngo-badge">{proposalStatusLabel(proposal)}</span>
      </div>
      <dl>
        <div>
          <dt>Evidence</dt>
          <dd>
            {proposal.evidenceId} / {evidenceLabel ?? "unavailable"}
          </dd>
        </div>
        <div>
          <dt>Approvals</dt>
          <dd>{approvals} of 2 required distinct addresses</dd>
        </div>
        <div>
          <dt>Transaction source</dt>
          <dd>
            {"transaction" in proposal
              ? "Local demo fixture"
              : "None - local draft only"}
          </dd>
        </div>
        <div>
          <dt>Transaction status (demo)</dt>
          <dd>{transaction?.state ?? "Not submitted"}</dd>
        </div>
        {transaction?.hash && (
          <div>
            <dt>Hash (demo fixture)</dt>
            <dd>{transaction.hash}</dd>
          </div>
        )}
        {transaction?.blockNumber !== undefined && (
          <div>
            <dt>Block (demo fixture)</dt>
            <dd>{transaction.blockNumber}</dd>
          </div>
        )}
        {transaction?.gasUsed && (
          <div>
            <dt>Gas (demo fixture)</dt>
            <dd>{transaction.gasUsed}</dd>
          </div>
        )}
      </dl>
      {approvals >= 2 && proposal.status !== "RELEASED" && (
        <p className="ngo-warning">
          Approval threshold reached. Release still requires confirmed contract
          state.
        </p>
      )}
      <div className="ngo-approval-list">
        {proposal.approvals.map((approval, index) => {
          const normalized = approval.address.trim().toLowerCase();
          const duplicate = seen.has(normalized);
          seen.add(normalized);
          return (
            <span
              key={`${approval.address}-${index}`}
              className={approval.approved ? "ngo-success" : "ngo-muted"}
            >
              {approval.approved ? "Approved" : "Not approved"}:{" "}
              {approval.address}
              {duplicate ? " (duplicate ignored)" : ""}
            </span>
          );
        })}
      </div>
      {"transaction" in proposal && proposal.status === "RELEASED" && (
        <p className="ngo-help">
          This is a local release fixture only. A real release requires a
          confirmed adapter response.
        </p>
      )}
    </aside>
  );
}

export default NGODashboard;
