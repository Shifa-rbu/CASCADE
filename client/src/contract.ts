import {
  BrowserProvider,
  Contract,
  Interface,
  isAddress,
  parseEther,
  solidityPackedKeccak256,
} from "ethers";
import type { Eip1193Provider } from "./wallet";

export const ESCROW_ABI = [
  "function campaign() view returns (string purpose, bytes32 allowedCategory, uint256 spendingCap)",
  "function vendorNonces(address vendor) view returns (uint256)",
  "function proposeSpend(uint256 campaignId,uint256 amount,bytes32 category,bytes32 invoiceNullifier,bytes32 evidenceDigest,uint256 nonce,uint64 deadline,bytes vendorSignature) returns (uint256 proposalId)",
  "event SpendProposed(uint256 indexed proposalId,uint256 indexed campaignId,address indexed vendor,uint256 amount,bytes32 category,bytes32 invoiceNullifier,bytes32 evidenceDigest,uint8 status)",
  "event DuplicateInvoiceAttempt(uint256 indexed proposalId,bytes32 indexed invoiceNullifier,uint8 existingState,uint256 existingProposalId,address vendor)",
  "event EvidenceDuplicateAttempt(uint256 indexed proposalId,bytes32 indexed evidenceDigest,uint256 existingProposalId,address vendor)",
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
