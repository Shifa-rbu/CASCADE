import {
  BrowserProvider,
  Contract,
  Interface,
  formatEther,
  isAddress,
  parseEther,
  solidityPackedKeccak256,
} from "ethers";
import type { Eip1193Provider } from "./wallet";

export const ESCROW_ABI = [
  "function campaign() view returns (string purpose, bytes32 allowedCategory, uint256 spendingCap)",
  "function campaignBalance(uint256 campaignId) view returns (uint256)",
  "function availableBalance() view returns (uint256)",
  "function reservedTotal() view returns (uint256)",
  "function releasedTotal() view returns (uint256)",
  "function nextProposalId() view returns (uint256)",
  "function vendorNonces(address vendor) view returns (uint256)",
  "function vendorKeyActive(address vendor) view returns (bool)",
  "function approvers(uint256 index) view returns (address)",
  "function hasApproved(uint256 proposalId, address approver) view returns (bool)",
  "function proposals(uint256 proposalId) view returns (uint256 campaignId, uint256 amount, bytes32 category, bytes32 invoiceNullifier, bytes32 evidenceDigest, address vendor, address proposer, uint64 deadline, uint8 status, uint8 approvalCount, uint8 reviewOutcome)",
  "function proposeSpend(uint256 campaignId,uint256 amount,bytes32 category,bytes32 invoiceNullifier,bytes32 evidenceDigest,uint256 nonce,uint64 deadline,bytes vendorSignature) returns (uint256 proposalId)",
  "function approveSpend(uint256 proposalId)",
  "function releaseSpend(uint256 proposalId)",
  "function cancelOrExpireReservation(uint256 proposalId)",
  "function resolveReview(uint256 proposalId, uint8 outcome)",
  "function donate(uint256 campaignId) payable",
  "event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount)",
  "event SpendProposed(uint256 indexed proposalId,uint256 indexed campaignId,address indexed vendor,uint256 amount,bytes32 category,bytes32 invoiceNullifier,bytes32 evidenceDigest,uint8 status)",
  "event SpendApproved(uint256 indexed proposalId, address indexed approver, uint8 approvalCount)",
  "event DuplicateInvoiceAttempt(uint256 indexed proposalId,bytes32 indexed invoiceNullifier,uint8 existingState,uint256 existingProposalId,address vendor)",
  "event EvidenceDuplicateAttempt(uint256 indexed proposalId,bytes32 indexed evidenceDigest,uint256 existingProposalId,address vendor)",
  "event SpendReleased(uint256 indexed proposalId, address indexed vendor, uint256 amount)",
  "event ReservationCancelled(uint256 indexed proposalId, bytes32 indexed invoiceNullifier)",
  "event ReviewResolved(uint256 indexed proposalId, address indexed reviewer, uint8 outcome)",
];

export interface EscrowConfiguration {
  address: `0x${string}`;
  chainId: number;
}

export interface ProposalSubmission {
  hash: `0x${string}`;
  proposalId: string;
  heldForReview: boolean;
}

export interface OnChainCampaignState {
  purpose: string;
  allowedCategory: string;
  spendingCapEth: string;
  campaignBalanceEth: string;
  availableBalanceEth: string;
  reservedTotalEth: string;
  releasedTotalEth: string;
  approvers: string[];
  nextProposalId: number;
}

export function getEscrowConfiguration(): EscrowConfiguration | null {
  const address = import.meta.env?.VITE_ESCROW_ADDRESS;
  if (!address) return null;
  if (!isAddress(address)) {
    throw new Error("VITE_ESCROW_ADDRESS must contain a valid contract address.");
  }

  const chainId = Number(import.meta.env?.VITE_CHAIN_ID || "31337");
  if (chainId !== 31_337 && chainId !== 80_002) {
    throw new Error("Only local Hardhat (31337) and Polygon Amoy (80002) are supported.");
  }
  return { address: address as `0x${string}`, chainId };
}

export async function submitEvidenceProposal(options: {
  provider: Eip1193Provider;
  account: `0x${string}`;
  config: EscrowConfiguration;
  digest: `0x${string}`;
  amountEth: string;
  onSubmitted: (hash: `0x${string}`) => void;
}): Promise<ProposalSubmission> {
  const { provider, account, config, digest, amountEth, onSubmitted } = options;
  const amount = parseEther(amountEth);
  if (amount <= 0n) throw new Error("Proposal amount must be greater than zero.");

  const browserProvider = new BrowserProvider(provider);
  const network = await browserProvider.getNetwork();
  if (network.chainId !== BigInt(config.chainId)) {
    throw new Error(`Wallet network mismatch. Select chain ${config.chainId} and try again.`);
  }
  if ((await browserProvider.getCode(config.address)) === "0x") {
    throw new Error("No escrow contract is deployed at the configured address on this network.");
  }

  const signer = await browserProvider.getSigner(account);
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== account.toLowerCase()) {
    throw new Error("The selected wallet account changed. Reconnect and try again.");
  }

  const readContract = new Contract(config.address, ESCROW_ABI, browserProvider);
  const campaign = await readContract.campaign();
  const category: string = campaign.allowedCategory;
  const nonce: bigint = await readContract.vendorNonces(account);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const invoiceNullifier = solidityPackedKeccak256(
    ["string", "bytes32", "address"],
    ["CASCADE_INVOICE_V1", digest, account],
  );
  const domain = {
    name: "CascadePurposeBoundEscrow",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.address,
  };
  const types = {
    VendorSpend: [
      { name: "campaignId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "category", type: "bytes32" },
      { name: "invoiceNullifier", type: "bytes32" },
      { name: "evidenceDigest", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
  };
  const value = {
    campaignId: 1n,
    amount,
    category,
    invoiceNullifier,
    evidenceDigest: digest,
    nonce,
    deadline,
  };
  const signature = await signer.signTypedData(domain, types, value);
  const writeContract = new Contract(config.address, ESCROW_ABI, signer);
  const transaction = await writeContract.proposeSpend(
    value.campaignId,
    value.amount,
    value.category,
    value.invoiceNullifier,
    value.evidenceDigest,
    value.nonce,
    value.deadline,
    signature,
  );
  onSubmitted(transaction.hash);

  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw Object.assign(new Error("The proposal transaction failed on-chain."), {
      transactionHash: transaction.hash,
    });
  }

  const contractInterface = new Interface(ESCROW_ABI);
  let proposalId: string | null = null;
  let heldForReview = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.address.toLowerCase()) continue;
    try {
      const event = contractInterface.parseLog(log);
      if (!event) continue;
      if (event.name === "SpendProposed") {
        proposalId = event.args.proposalId.toString();
        heldForReview = BigInt(event.args.status) === 2n;
      } else if (
        event.name === "DuplicateInvoiceAttempt" ||
        event.name === "EvidenceDuplicateAttempt"
      ) {
        heldForReview = true;
      }
    } catch {
      continue;
    }
  }

  if (!proposalId) {
    throw Object.assign(
      new Error("Transaction confirmed, but no proposal event was found."),
      { transactionHash: transaction.hash },
    );
  }
  return { hash: transaction.hash, proposalId, heldForReview };
}

export async function approveSpendProposal(options: {
  provider: Eip1193Provider;
  account: string;
  config: EscrowConfiguration;
  proposalId: string | number | bigint;
  onSubmitted?: (hash: `0x${string}`) => void;
}): Promise<{ hash: `0x${string}`; approvalCount: number }> {
  const { provider, account, config, proposalId, onSubmitted } = options;
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner(account);
  const writeContract = new Contract(config.address, ESCROW_ABI, signer);

  const transaction = await writeContract.approveSpend(BigInt(proposalId));
  if (onSubmitted) onSubmitted(transaction.hash);

  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Approval transaction failed on-chain.");
  }

  const contractInterface = new Interface(ESCROW_ABI);
  let approvalCount = 1;
  for (const log of receipt.logs) {
    try {
      const event = contractInterface.parseLog(log);
      if (event && event.name === "SpendApproved") {
        approvalCount = Number(event.args.approvalCount);
      }
    } catch {
      continue;
    }
  }

  return { hash: transaction.hash, approvalCount };
}

export async function releaseSpendProposal(options: {
  provider: Eip1193Provider;
  account: string;
  config: EscrowConfiguration;
  proposalId: string | number | bigint;
  onSubmitted?: (hash: `0x${string}`) => void;
}): Promise<{ hash: `0x${string}` }> {
  const { provider, account, config, proposalId, onSubmitted } = options;
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner(account);
  const writeContract = new Contract(config.address, ESCROW_ABI, signer);

  const transaction = await writeContract.releaseSpend(BigInt(proposalId));
  if (onSubmitted) onSubmitted(transaction.hash);

  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Release transaction failed on-chain.");
  }

  return { hash: transaction.hash };
}

export async function resolveReviewProposal(options: {
  provider: Eip1193Provider;
  account: string;
  config: EscrowConfiguration;
  proposalId: string | number | bigint;
  outcome: number; // 1 = false positive, 2 = confirmed duplicate
  onSubmitted?: (hash: `0x${string}`) => void;
}): Promise<{ hash: `0x${string}` }> {
  const { provider, account, config, proposalId, outcome, onSubmitted } = options;
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner(account);
  const writeContract = new Contract(config.address, ESCROW_ABI, signer);

  const transaction = await writeContract.resolveReview(BigInt(proposalId), outcome);
  if (onSubmitted) onSubmitted(transaction.hash);

  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Review resolution transaction failed on-chain.");
  }

  return { hash: transaction.hash };
}

export async function donateToCampaign(options: {
  provider: Eip1193Provider;
  account: string;
  config: EscrowConfiguration;
  amountEth: string;
  onSubmitted?: (hash: `0x${string}`) => void;
}): Promise<{ hash: `0x${string}` }> {
  const { provider, account, config, amountEth, onSubmitted } = options;
  const amount = parseEther(amountEth);
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner(account);
  const writeContract = new Contract(config.address, ESCROW_ABI, signer);

  const transaction = await writeContract.donate(1n, { value: amount });
  if (onSubmitted) onSubmitted(transaction.hash);

  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Donation transaction failed on-chain.");
  }

  return { hash: transaction.hash };
}

export async function readOnChainCampaignState(
  provider: Eip1193Provider,
  config: EscrowConfiguration,
): Promise<OnChainCampaignState> {
  const browserProvider = new BrowserProvider(provider);
  const readContract = new Contract(config.address, ESCROW_ABI, browserProvider);

  const [campaign, balance, available, reserved, released, nextProposalId] =
    await Promise.all([
      readContract.campaign(),
      readContract.campaignBalance(1n),
      readContract.availableBalance(),
      readContract.reservedTotal(),
      readContract.releasedTotal(),
      readContract.nextProposalId(),
    ]);

  const approvers: string[] = [];
  for (let i = 0; i < 3; i++) {
    try {
      const addr = await readContract.approvers(i);
      approvers.push(addr);
    } catch {
      break;
    }
  }

  return {
    purpose: campaign.purpose,
    allowedCategory: campaign.allowedCategory,
    spendingCapEth: formatEther(campaign.spendingCap),
    campaignBalanceEth: formatEther(balance),
    availableBalanceEth: formatEther(available),
    reservedTotalEth: formatEther(reserved),
    releasedTotalEth: formatEther(released),
    approvers,
    nextProposalId: Number(nextProposalId),
  };
}
