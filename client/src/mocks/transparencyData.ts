export type TimelineEventType =
  | "DONATION_RECEIVED"
  | "SIMULATED_BRIDGE_LEG"
  | "SIMULATED_FIAT_PAYOUT"
  | "EVIDENCE_DIGEST_RECORDED"
  | "SPEND_PROPOSED"
  | "SPEND_APPROVED"
  | "FUNDS_RELEASED"
  | "DUPLICATE_REPLAY_HALTED"
  | "REVIEW_RESOLVED";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  category: "ON_CHAIN" | "SIMULATED" | "OFF_CHAIN_SAFE" | "EXCEPTION";
  timestamp: string;
  actor: string;
  amount?: string;
  hash?: string;
  blockNumber?: number;
  gasUsed?: string;
  details: string;
  badge: {
    label: string;
    variant: "success" | "warning" | "error" | "info" | "neutral";
  };
}

export interface AdversarialBenchmarkItem {
  id: string;
  filename: string;
  vendor: string;
  amount: string;
  injectedDefect: string;
  detectionLayer: string;
  verdict: "BLOCKED" | "ACCEPTED" | "PAUSED_REVIEW";
  isDefect: boolean;
  notes: string;
}

export const transparencyEvents: TimelineEvent[] = [
  {
    id: "evt-001",
    type: "DONATION_RECEIVED",
    title: "10.00 ETH Grant Donated into Escrow",
    category: "ON_CHAIN",
    timestamp: "2026-10-26T01:30:00Z",
    actor: "CSR Anchor (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)",
    amount: "10.00 ETH",
    hash: "0x3e1f8872b0cf29188d30e38a291f00a98c56fe89012cdbf78601d89772bf6201",
    blockNumber: 1,
    gasUsed: "44,812",
    details:
      "Direct contract donation to Campaign #1 (Community Support & Water Infrastructure). Funds are locked subject to the spending cap of 20 ETH.",
    badge: { label: "ON-CHAIN CONFIRMED", variant: "success" },
  },
  {
    id: "evt-002",
    type: "SIMULATED_BRIDGE_LEG",
    title: "Source Lock & Cross-Chain Message Relayed",
    category: "SIMULATED",
    timestamp: "2026-10-26T02:15:00Z",
    actor: "Bridge Relayer (Message ID: msg-cc-88319)",
    amount: "1.50 ETH",
    details:
      "Simulated bridge adapter: Source lock emitted on EVM A, relayed to EVM B receiver contract with deterministic message ID. Not a live production bridge.",
    badge: { label: "SIMULATED BRIDGE", variant: "warning" },
  },
  {
    id: "evt-003",
    type: "SIMULATED_FIAT_PAYOUT",
    title: "Vendor Fiat Off-Ramp Disbursement Attestation",
    category: "SIMULATED",
    timestamp: "2026-10-26T02:40:00Z",
    actor: "Seeded Payer Key (0x90F79bf6EB2c4f870365E785982E1f101E93b906)",
    amount: "₹3,48,500 INR (~1.48 ETH)",
    details:
      "Synthetic fiat payout fixture signed by demo payer key. Verified exchange rate (1 ETH = ₹2,35,472) and fee (0.2%). Demonstrates reconciliation without a live banking partner.",
    badge: { label: "SIMULATED FIAT", variant: "warning" },
  },
  {
    id: "evt-004",
    type: "EVIDENCE_DIGEST_RECORDED",
    title: "Synthetic Invoice Digest Computed (SHA-256)",
    category: "OFF_CHAIN_SAFE",
    timestamp: "2026-10-26T03:00:00Z",
    actor: "Express Private Storage",
    details:
      "Invoice PDF verified off-chain. Exact SHA-256 digest 0x7a9c8f... recorded. File stored in private git-ignored directory; raw vendor PII never exposed publicly.",
    badge: { label: "SAFE EVIDENCE", variant: "info" },
  },
  {
    id: "evt-005",
    type: "SPEND_PROPOSED",
    title: "Spend Proposal #1 Submitted (0.01 ETH)",
    category: "ON_CHAIN",
    timestamp: "2026-10-26T03:10:00Z",
    actor: "Demo Vendor (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)",
    amount: "0.01 ETH",
    hash: "0x89d2cb3781290378bcdef76109a126788a10972bc278912ef10928cd76109a12",
    blockNumber: 4,
    gasUsed: "128,491",
    details:
      "Spend proposal validated against campaign category 'community'. Vendor provided valid EIP-712 typed signature; invoice nullifier reserved on-chain.",
    badge: { label: "RESERVED", variant: "info" },
  },
  {
    id: "evt-006",
    type: "SPEND_APPROVED",
    title: "Multi-Sig Approval 1 of 2 Recorded",
    category: "ON_CHAIN",
    timestamp: "2026-10-26T03:20:00Z",
    actor: "Approver 1 (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)",
    hash: "0x12a9bc489721098efbc1298471092837bcde89123847910283748912098bc12a",
    blockNumber: 5,
    gasUsed: "48,220",
    details:
      "Authorized approver signed direct contract transaction. Approver address recorded; duplicate approval by the same address is strictly blocked.",
    badge: { label: "1 OF 2 APPROVALS", variant: "neutral" },
  },
  {
    id: "evt-007",
    type: "SPEND_APPROVED",
    title: "Multi-Sig Approval 2 of 2 Recorded (Threshold Met)",
    category: "ON_CHAIN",
    timestamp: "2026-10-26T03:25:00Z",
    actor: "Approver 2 (0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)",
    hash: "0x98bca12098471029837498127398127398471092837498127398471029384710",
    blockNumber: 6,
    gasUsed: "48,220",
    details:
      "Second distinct approver signed direct transaction. Threshold (2 of 3) reached. Proposal status transitioned to releasable.",
    badge: { label: "THRESHOLD REACHED", variant: "success" },
  },
  {
    id: "evt-008",
    type: "FUNDS_RELEASED",
    title: "Funds Released to Vendor Wallet (0.01 ETH)",
    category: "ON_CHAIN",
    timestamp: "2026-10-26T03:30:00Z",
    actor: "PurposeBoundEscrow Contract",
    amount: "0.01 ETH",
    hash: "0xab1289c091823748912738947109283740918237409182374091823740918237",
    blockNumber: 7,
    gasUsed: "68,914",
    details:
      "Contract executed payment to vendor. Invoice nullifier transitioned from RESERVED to CONSUMED. Replay protection is now permanently active for this receipt.",
    badge: { label: "RELEASED", variant: "success" },
  },
  {
    id: "evt-009",
    type: "DUPLICATE_REPLAY_HALTED",
    title: "Cross-Report Replay Attack Blocked (Duplicate Nullifier)",
    category: "EXCEPTION",
    timestamp: "2026-10-26T03:45:00Z",
    actor: "Adversary / Replay Script",
    amount: "0.01 ETH",
    hash: "0xfe98123740918237409182374091823740918237409182374091823740918237",
    blockNumber: 8,
    gasUsed: "72,110",
    details:
      "HERO MOMENT: The same invoice nullifier was submitted under a different donor report. The smart contract caught the collision in the consumed nullifier registry, emitted DuplicateInvoiceAttempt, and durably locked the proposal in PAUSED_REVIEW without reverting. No double-spending permitted.",
    badge: { label: "REPLAY FROZEN", variant: "error" },
  },
];

export const benchmarkReceipts: AdversarialBenchmarkItem[] = [
  {
    id: "RCPT-001",
    filename: "borewell-drill-tranche1.pdf",
    vendor: "AquaTech Engineering Ltd",
    amount: "0.010 ETH",
    injectedDefect: "None (Legitimate)",
    detectionLayer: "SHA-256 + EIP-712 Signature",
    verdict: "ACCEPTED",
    isDefect: false,
    notes: "Baseline valid spend; passes all digest and ECDSA checks.",
  },
  {
    id: "RCPT-002",
    filename: "borewell-drill-tranche1-DUP.pdf",
    vendor: "AquaTech Engineering Ltd",
    amount: "0.010 ETH",
    injectedDefect: "Reused Invoice Nullifier across donor reports",
    detectionLayer: "On-Chain Consumed Nullifier Registry",
    verdict: "PAUSED_REVIEW",
    isDefect: true,
    notes: "Hero test: Nullifier already marked CONSUMED; halts on-chain without revert.",
  },
  {
    id: "RCPT-003",
    filename: "filtration-membrane-unit.pdf",
    vendor: "PureWater Systems",
    amount: "0.025 ETH",
    injectedDefect: "Single-byte alteration in PDF stream (tampered amount)",
    detectionLayer: "SHA-256 Byte Digest Mismatch",
    verdict: "BLOCKED",
    isDefect: true,
    notes: "Uploaded bytes fail to match client-computed or vendor-signed SHA-256 digest.",
  },
  {
    id: "RCPT-004",
    filename: "solar-pump-controller.pdf",
    vendor: "SunFlow Rural Power",
    amount: "0.040 ETH",
    injectedDefect: "None (Legitimate)",
    detectionLayer: "SHA-256 + EIP-712 Signature",
    verdict: "ACCEPTED",
    isDefect: false,
    notes: "Valid renewable water pumping equipment invoice.",
  },
  {
    id: "RCPT-005",
    filename: "pvc-piping-conduits-forged-sig.pdf",
    vendor: "Apex Agri Pipes",
    amount: "0.015 ETH",
    injectedDefect: "Forged vendor key signature (mismatched recovery address)",
    detectionLayer: "EIP-712 ECDSA Signature Verification",
    verdict: "BLOCKED",
    isDefect: true,
    notes: "Recovered signer does not match registered active vendor whitelist on contract.",
  },
  {
    id: "RCPT-006",
    filename: "water-tank-masonry.pdf",
    vendor: "Nagpur Rural Builders",
    amount: "0.030 ETH",
    injectedDefect: "None (Legitimate)",
    detectionLayer: "SHA-256 + EIP-712 Signature",
    verdict: "ACCEPTED",
    isDefect: false,
    notes: "Valid masonry construction work receipt.",
  },
  {
    id: "RCPT-007",
    filename: "chlorination-dosing-kit.pdf",
    vendor: "SafeWater Chemical Co",
    amount: "0.008 ETH",
    injectedDefect: "None (Legitimate)",
    detectionLayer: "SHA-256 + EIP-712 Signature",
    verdict: "ACCEPTED",
    isDefect: false,
    notes: "Sanitation chemical dosing unit invoice.",
  },
  {
    id: "RCPT-008",
    filename: "community-generator-fuel.pdf",
    vendor: "Vidarbha Petroleum",
    amount: "0.005 ETH",
    injectedDefect: "Wrong spending category ('logistics' vs 'community')",
    detectionLayer: "Contract Allowed Category Guard",
    verdict: "BLOCKED",
    isDefect: true,
    notes: "Category mismatch rejected by PurposeBoundEscrow require guard.",
  },
  {
    id: "RCPT-009",
    filename: "flow-meter-sensor-esp32.pdf",
    vendor: "IoT Field Solutions",
    amount: "0.012 ETH",
    injectedDefect: "None (Legitimate)",
    detectionLayer: "SHA-256 + Device Attestation",
    verdict: "ACCEPTED",
    isDefect: false,
    notes: "Field-verification ESP32 flow attestation node hardware invoice.",
  },
  {
    id: "RCPT-010",
    filename: "submersible-cable-spool.pdf",
    vendor: "Vidarbha Electricals",
    amount: "0.009 ETH",
    injectedDefect: "None (Legitimate)",
    detectionLayer: "SHA-256 + EIP-712 Signature",
    verdict: "ACCEPTED",
    isDefect: false,
    notes: "Electrical wiring conduit for pump installation.",
  },
];

export const benchmarkSummary = {
  totalTested: 10,
  legitimateCount: 6,
  forgedOrAdversarialCount: 4, // 30%+ adversarial challenge batch
  forgeriesDetected: 4,
  falsePositives: 0,
  precision: "100.0%",
  recall: "100.0%",
  falsePositiveRate: "0.0%",
  avgVerificationTimeMs: 42,
  gasPerProposal: "~128,000 gas",
};

