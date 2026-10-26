import type { Eip1193Provider } from "../../wallet";

export type WalletTransactionState = "signature needed" | "pending" | "confirmed" | "failed";
export type Bytes32Hex = `0x${string}`;

export interface WalletTransaction {
  source?: "adapter";
  state: WalletTransactionState;
  hash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
}

export type ContractProposalStatus =
  | "NONE"
  | "RESERVED"
  | "PAUSED_REVIEW"
  | "RELEASED"
  | "CANCELLED";

export type EvidenceStatus =
  | "FILE_DIGEST_MATCH"
  | "SIGNED_BY_DEMO_KEY"
  | "DUPLICATE_DETECTED"
  | "UNVERIFIED"
  | "PAUSED_REVIEW";

export type HeldReviewCaseStatus = "NONE" | "PAUSED_REVIEW";

export type ResolutionOutcome =
  | "NONE"
  | "DISMISSED_FALSE_POSITIVE"
  | "CONFIRMED_DUPLICATE";

export interface ProposeSpendInput {
  campaignId: bigint;
  amount: bigint;
  category: Bytes32Hex;
  invoiceNullifier: Bytes32Hex;
  evidenceDigest: Bytes32Hex;
  nonce: bigint;
  deadline: bigint;
  vendorSignature: string;
}

export interface WalletSnapshot {
  address?: string;
  chainId?: number;
  isConnected: boolean;
  isCorrectChain: boolean;
  error?: string;
}

export interface ContractActionBoundary {
  /** The integrator must map signed evidence fields to the published ABI. */
  proposeSpend: (args: ProposeSpendInput) => Promise<WalletTransaction>;
  approveSpend: (proposalId: bigint) => Promise<WalletTransaction>;
  releaseSpend: (proposalId: bigint) => Promise<WalletTransaction>;
}

export interface AmountConversion {
  description: string;
  toBaseUnits: (amount: number) => bigint;
}

export interface WalletStatusProps {
  expectedChainId?: number;
  onChange?: (snapshot: WalletSnapshot) => void;
}

export type EthereumProvider = Eip1193Provider;
