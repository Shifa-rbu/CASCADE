# Escrow contract interface

This interface is the Backend 1 contract boundary for the local Hardhat demo. It describes the current implementation in `contracts/PurposeBoundEscrow.sol`. Confirm these signatures and the EIP-712 fields with the other feature owners before building an adapter against them.

## Campaign and roles

The contract creates one campaign at deployment with ID `1`. `purpose` is public text, `allowedCategory` is a `bytes32` category code, and `spendingCap` is the cumulative amount that may be reserved or released. The contract's native-token balance is the test donation balance; `availableBalance()` subtracts active reservations.

- The deployer is the administrator and may activate/deactivate vendor signing keys.
- Three distinct addresses are fixed as approvers at deployment; two separate approvals are required for release.
- One fixed reviewer may resolve duplicate reviews and cancel an active reservation.
- Any account may donate. A vendor EIP-712 signature authorizes the proposal regardless of which account submits it.
- The vendor who signed a proposal receives its payment.

No raw invoice, evidence file, beneficiary, or bank details are stored on-chain. The contract exposes only a caller-supplied opaque invoice nullifier and evidence digest; the evidence API owns private file handling.

## Methods

```solidity
constructor(
    string purpose,
    bytes32 allowedCategory,
    uint256 spendingCap,
    address[3] authorizedApprovers,
    address reviewAddress
)
donate(uint256 campaignId) payable
campaignBalance(uint256 campaignId) view returns (uint256)
availableBalance() view returns (uint256)
setVendorKeyStatus(address vendor, bool active)
proposeSpend(
    uint256 campaignId,
    uint256 amount,
    bytes32 category,
    bytes32 invoiceNullifier,
    bytes32 evidenceDigest,
    uint256 nonce,
    uint64 deadline,
    bytes vendorSignature
) returns (uint256 proposalId)
approveSpend(uint256 proposalId)
releaseSpend(uint256 proposalId)
cancelOrExpireReservation(uint256 proposalId)
resolveReview(uint256 proposalId, ReviewOutcome outcome)
domainSeparator() view returns (bytes32)
```

`setVendorKeyStatus` is admin-only. `approveSpend` is restricted to the three configured approvers and rejects repeat approval by the same address. `releaseSpend` requires two distinct approvals, an active vendor key, and an unexpired reservation. The caller who proposes is not treated as a privileged role.

An active reservation can be cancelled by its proposer or reviewer before its deadline. After the deadline anyone can expire it. Cancellation changes `RESERVED` back to `UNSEEN`, allowing a fresh proposal with a fresh signature. A paid invoice remains `CONSUMED` permanently.

## EIP-712 vendor authorization

The domain is `name: "CascadePurposeBoundEscrow"`, `version: "1"`, the current `chainId`, and this contract address. The exact primary type is:

```text
VendorSpend(
  uint256 campaignId,
  uint256 amount,
  bytes32 category,
  bytes32 invoiceNullifier,
  bytes32 evidenceDigest,
  uint256 nonce,
  uint64 deadline
)
```

Each active vendor signs and submits the current `vendorNonces(vendor)` value. A successful proposal consumes that nonce, including a duplicate attempt. The contract verifies the signature and active key when proposing, and checks that the key remains active at approval and release.

## States and duplicate handling

```text
ProposalStatus: NONE | RESERVED | PAUSED_REVIEW | RELEASED | CANCELLED
InvoiceState:   UNSEEN | RESERVED | CONSUMED
ReviewOutcome:  NONE | DISMISSED_FALSE_POSITIVE | CONFIRMED_DUPLICATE
```

Normal lifecycle: `UNSEEN -> RESERVED -> CONSUMED` on payment, or `UNSEEN -> RESERVED -> UNSEEN` on authorized cancellation/expiry. A nullifier already `RESERVED` or `CONSUMED` creates a `PAUSED_REVIEW` proposal and emits `DuplicateInvoiceAttempt`; this path returns normally and does not reserve funds or pay the vendor. The prior invoice state and proposal ID remain unchanged.

Only the reviewer may resolve a held proposal, once. `CONFIRMED_DUPLICATE` keeps it held; `DISMISSED_FALSE_POSITIVE` marks that held proposal `CANCELLED`. Resolution never deletes the incident. To retry after a false positive against an unpaid reservation, cancel/expire the original reservation and submit a new proposal with a fresh signature.

## Events

```solidity
DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount)
VendorKeyStatusChanged(address indexed vendor, bool active)
SpendProposed(uint256 indexed proposalId, uint256 indexed campaignId, address indexed vendor, uint256 amount, bytes32 category, bytes32 invoiceNullifier, bytes32 evidenceDigest, ProposalStatus status)
SpendApproved(uint256 indexed proposalId, address indexed approver, uint8 approvalCount)
DuplicateInvoiceAttempt(uint256 indexed proposalId, bytes32 indexed invoiceNullifier, InvoiceState existingState, uint256 existingProposalId, address vendor)
SpendReleased(uint256 indexed proposalId, address indexed vendor, uint256 amount)
ReservationCancelled(uint256 indexed proposalId, bytes32 indexed invoiceNullifier)
ReviewResolved(uint256 indexed proposalId, address indexed reviewer, ReviewOutcome outcome)
```

## Public reads

`campaign()` returns the purpose, allowed category, and spending cap. `campaignBalance(1)`, `availableBalance()`, `reservedTotal`, and `releasedTotal` expose safe aggregate amounts. `proposals(id)` exposes the fields in the `Proposal` struct; `invoiceStates(nullifier)`, `invoiceProposalIds(nullifier)`, `hasApproved(id, address)`, `vendorKeyActive(vendor)`, and `vendorNonces(vendor)` support detail views. All evidence digests and nullifiers are opaque identifiers, not evidence contents.

Local chain status and bridge/fiat examples are UI/API concerns; any such entries must be visibly labeled as simulations.
