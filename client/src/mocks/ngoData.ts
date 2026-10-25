import type {
  ContractProposalStatus,
  EvidenceStatus,
  HeldReviewCaseStatus,
  ResolutionOutcome,
} from "../features/wallet/walletTypes";

export type EvidenceState = EvidenceStatus;
export type ProposalStatus = ContractProposalStatus;
export type ReviewCaseStatus = HeldReviewCaseStatus;
export type ReviewOutcome = ResolutionOutcome;
export type LocalDraftStatus = "LOCAL_DRAFT";

export interface CampaignMock {
  id: string;
  contractCampaignId: bigint;
  purpose: string;
  allowedCategory: string;
  cap: number;
  contractBalance: number;
  currentTranche: number;
  trancheCount: number;
  currency: string;
  chainId: number;
}

export interface ApprovalMock {
  address: string;
  approved: boolean;
  approvedAt?: string;
}

export interface EvidenceMock {
  id: string;
  state: EvidenceState;
  label: string;
  detail: string;
  updatedAt: string;
}

export interface ReviewCaseMock {
  id: string;
  proposalId: string;
  status: ReviewCaseStatus;
  outcome: ReviewOutcome;
  reason: string;
  assignedReviewer: string;
  requestedEvidence: string[];
  nextAction: string;
}

export interface TransactionMock {
  source: "demo";
  state: "signature needed" | "pending" | "confirmed" | "failed";
  hash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
}

export interface SpendProposalMock {
  id: string;
  amount: number;
  category: string;
  invoiceReference: string;
  evidenceId: string;
  status: ProposalStatus;
  approvals: ApprovalMock[];
  transaction?: TransactionMock;
  createdAt: string;
}

export interface LocalDraftMock {
  id: string;
  status: LocalDraftStatus;
  amount: number;
  category: string;
  invoiceReference: string;
  evidenceId: string;
  approvals: ApprovalMock[];
  createdAt: string;
}

export const ngoCampaign: CampaignMock = {
  id: "campaign-demo-001",
  contractCampaignId: 1n,
  purpose: "Emergency water access and sanitation supplies",
  allowedCategory: "Water and sanitation",
  cap: 50000,
  contractBalance: 32750,
  currentTranche: 2,
  trancheCount: 4,
  currency: "USD",
  chainId: 31337,
};

export const ngoEvidence: EvidenceMock[] = [
  {
    id: "evidence-demo-001",
    state: "FILE_DIGEST_MATCH",
    label: "Invoice digest matched",
    detail: "The opaque evidence reference matches the digest submitted for review.",
    updatedAt: "2026-10-24T09:30:00Z",
  },
  {
    id: "evidence-demo-002",
    state: "SIGNED_BY_DEMO_KEY",
    label: "Demo signature verified",
    detail: "The fixture was signed by the configured demonstration key.",
    updatedAt: "2026-10-23T15:10:00Z",
  },
  {
    id: "evidence-demo-003",
    state: "PAUSED_REVIEW",
    label: "Review paused",
    detail: "A reviewer requested a clearer invoice reference before release.",
    updatedAt: "2026-10-22T11:45:00Z",
  },
  {
    id: "evidence-demo-004",
    state: "DUPLICATE_DETECTED",
    label: "Possible duplicate detected",
    detail: "A matching digest was found in the demo review set; this is a review signal, not a fraud finding.",
    updatedAt: "2026-10-21T10:05:00Z",
  },
  {
    id: "evidence-demo-005",
    state: "UNVERIFIED",
    label: "Evidence unverified",
    detail: "No verification result is available in this local fixture.",
    updatedAt: "2026-10-19T16:20:00Z",
  },
];

export const ngoProposals: SpendProposalMock[] = [
  {
    id: "proposal-demo-014",
    amount: 4200,
    category: "Water and sanitation",
    invoiceReference: "INV-DEMO-014",
    evidenceId: "evidence-demo-001",
    status: "RESERVED",
    approvals: [
      { address: "0x71C...A91", approved: true, approvedAt: "2026-10-24T10:00:00Z" },
      { address: "0xA04...2D8", approved: true, approvedAt: "2026-10-24T10:14:00Z" },
      { address: "0xD12...F40", approved: false },
    ],
    transaction: {
      source: "demo",
      state: "pending",
      hash: "0xDEMO_PENDING_014",
    },
    createdAt: "2026-10-24T09:20:00Z",
  },
  {
    id: "proposal-demo-013",
    amount: 1850,
    category: "Water and sanitation",
    invoiceReference: "INV-DEMO-013",
    evidenceId: "evidence-demo-002",
    status: "RELEASED",
    approvals: [
      { address: "0x71C...A91", approved: true, approvedAt: "2026-10-20T08:00:00Z" },
      { address: "0xA04...2D8", approved: true, approvedAt: "2026-10-20T08:05:00Z" },
      { address: "0xD12...F40", approved: true, approvedAt: "2026-10-20T08:15:00Z" },
    ],
    transaction: {
      source: "demo",
      state: "confirmed",
      hash: "0xDEMO_CONFIRMED_013",
      blockNumber: 1842,
      gasUsed: "128,400",
    },
    createdAt: "2026-10-20T07:40:00Z",
  },
  {
    id: "proposal-demo-012",
    amount: 960,
    category: "Water and sanitation",
    invoiceReference: "INV-DEMO-012",
    evidenceId: "evidence-demo-003",
    status: "PAUSED_REVIEW",
    approvals: [
      { address: "0x71C...A91", approved: true, approvedAt: "2026-10-18T13:00:00Z" },
      { address: "0x71C...A91", approved: true, approvedAt: "2026-10-18T13:04:00Z" },
      { address: "0xD12...F40", approved: false },
    ],
    createdAt: "2026-10-18T12:30:00Z",
  },
];

export const ngoReviewCases: ReviewCaseMock[] = [
  {
    id: "review-demo-004",
    proposalId: "proposal-demo-012",
    status: "PAUSED_REVIEW",
    outcome: "NONE",
    reason: "Invoice reference cannot be reconciled to the submitted evidence digest.",
    assignedReviewer: "Reviewer 2 (0xA04...2D8)",
    requestedEvidence: ["Corrected invoice reference", "Supplier quote digest"],
    nextAction: "Submit a new correction record for review",
  },
];
