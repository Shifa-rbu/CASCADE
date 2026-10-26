import { useState } from "react";
import { transparencyEvents } from "../../mocks/transparencyData";

export interface PublicTransparencyProps {
  onChainBalance?: string;
  contractAddress?: string;
  chainId?: number;
}

export function PublicTransparency({
  onChainBalance = "10.00 ETH",
  contractAddress,
  chainId = 31337,
}: PublicTransparencyProps) {
  const [filter, setFilter] = useState<"ALL" | "ON_CHAIN" | "SIMULATED" | "EXCEPTION">("ALL");
  const [selectedEventId, setSelectedEventId] = useState<string>(transparencyEvents[0].id);

  const filteredEvents = transparencyEvents.filter((event) => {
    if (filter === "ALL") return true;
    if (filter === "ON_CHAIN") return event.category === "ON_CHAIN";
    if (filter === "SIMULATED") return event.category === "SIMULATED";
    if (filter === "EXCEPTION") return event.category === "EXCEPTION";
    return true;
  });

  const selectedEvent = transparencyEvents.find((evt) => evt.id === selectedEventId);

  return (
    <section className="transparency-shell" aria-labelledby="transparency-title">
      <div className="card-heading" style={{ marginBottom: "20px" }}>
        <div>
          <p className="eyebrow">PUBLIC AUDIT TRAIL</p>
          <h2 id="transparency-title">Blockchain Transparency Explorer</h2>
          <p className="body-copy" style={{ margin: "6px 0 0" }}>
            Read-only, chain-sourced provenance log. Every spend proposal, multi-sig approval,
            and duplicate attempt is permanently anchored on-chain.
          </p>
        </div>
        <span className="demo-badge" style={{ backgroundColor: "#e7f3ec", color: "#10563b", borderColor: "#78a98e" }}>
          IMMUTABLE LOG
        </span>
      </div>

      {/* Aggregate Stats */}
      <div className="metrics-grid">
        <div className="metric-box">
          <span className="metric-label">Escrow Contract Balance</span>
          <span className="metric-value">{onChainBalance}</span>
          <span className="metric-sub">Local Hardhat · Chain #{chainId}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Threshold Rule</span>
          <span className="metric-value">2 of 3</span>
          <span className="metric-sub">Distinct wallet signatures</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Disbursed to Vendors</span>
          <span className="metric-value">0.010 ETH</span>
          <span className="metric-sub">Confirmed on-chain</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Replay Exploits Frozen</span>
          <span className="metric-value" style={{ color: "#8c3434" }}>1 Attempt</span>
          <span className="metric-sub">Zero funds leaked</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="timeline-filter-bar">
        <span className="filter-label">Filter Trail:</span>
        <button
          type="button"
          className={`filter-chip ${filter === "ALL" ? "is-active" : ""}`}
          onClick={() => setFilter("ALL")}
        >
          All Records ({transparencyEvents.length})
        </button>
        <button
          type="button"
          className={`filter-chip ${filter === "ON_CHAIN" ? "is-active" : ""}`}
          onClick={() => setFilter("ON_CHAIN")}
        >
          On-Chain Confirmed
        </button>
        <button
          type="button"
          className={`filter-chip ${filter === "SIMULATED" ? "is-active" : ""}`}
          onClick={() => setFilter("SIMULATED")}
        >
          Simulated Adapters
        </button>
        <button
          type="button"
          className={`filter-chip ${filter === "EXCEPTION" ? "is-active" : ""}`}
          onClick={() => setFilter("EXCEPTION")}
        >
          Exceptions & Duplicates
        </button>
      </div>

      {/* Main Timeline and Details */}
      <div className="timeline-layout">
        <div className="timeline-list">
          {filteredEvents.map((evt) => (
            <article
              key={evt.id}
              className={`timeline-card ${selectedEventId === evt.id ? "is-selected" : ""}`}
              onClick={() => setSelectedEventId(evt.id)}
            >
              <div className="timeline-card-header">
                <span className={`event-badge badge-${evt.badge.variant}`}>
                  {evt.badge.label}
                </span>
                <span className="timeline-time">
                  {new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <h4 className="timeline-card-title">{evt.title}</h4>
              <p className="timeline-card-actor">Actor: {evt.actor}</p>
              {evt.amount && <p className="timeline-card-amount">Amount: <strong>{evt.amount}</strong></p>}
            </article>
          ))}
        </div>

        {selectedEvent && (
          <aside className="timeline-details" aria-label="Event Details">
            <div className="timeline-details-header">
              <span className={`event-badge badge-${selectedEvent.badge.variant}`}>
                {selectedEvent.badge.label}
              </span>
              <h3>{selectedEvent.title}</h3>
            </div>
            <p className="timeline-details-desc">{selectedEvent.details}</p>

            <dl className="details-list">
              <div>
                <dt>Event ID</dt>
                <dd><code>{selectedEvent.id}</code></dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>{new Date(selectedEvent.timestamp).toUTCString()}</dd>
              </div>
              <div>
                <dt>Recorded Actor / Key</dt>
                <dd><code>{selectedEvent.actor}</code></dd>
              </div>
              {selectedEvent.hash && (
                <div>
                  <dt>Transaction Hash</dt>
                  <dd className="hash-val"><code>{selectedEvent.hash}</code></dd>
                </div>
              )}
              {selectedEvent.blockNumber !== undefined && (
                <div>
                  <dt>Block Number</dt>
                  <dd>#{selectedEvent.blockNumber}</dd>
                </div>
              )}
              {selectedEvent.gasUsed && (
                <div>
                  <dt>Gas Used</dt>
                  <dd>{selectedEvent.gasUsed} (local test gas)</dd>
                </div>
              )}
              {contractAddress && (
                <div>
                  <dt>Escrow Contract</dt>
                  <dd className="hash-val"><code>{contractAddress}</code></dd>
                </div>
              )}
            </dl>

            {selectedEvent.category === "SIMULATED" && (
              <div className="simulated-warning">
                <strong>Simulated Adapter Notice:</strong> This leg is a deterministic local fixture to demonstrate multi-hop reconciliation without real bank or public bridge dependencies.
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Honest Boundary Box */}
      <section className="limits-card" style={{ marginTop: "30px" }}>
        <div className="limits-icon" aria-hidden="true">✓</div>
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem" }}>What This Public Timeline Proves (and Does Not Prove)</h3>
          <p style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>
            <strong>Proves mathematically:</strong> Direct wallet cryptographic signatures, exact SHA-256 byte digest integrity, on-chain 2-of-3 threshold enforcement, and guaranteed rejection of duplicate invoice nullifiers within this registry.
          </p>
          <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--soft-muted)" }}>
            <strong>Does not claim:</strong> A file hash does not verify the real-world truthfulness of an invoice, local test accounts do not represent legally independent banks, and simulated bridge/fiat legs do not move live fiat currency.
          </p>
        </div>
      </section>
    </section>
  );
}

export default PublicTransparency;

