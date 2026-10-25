// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PurposeBoundEscrow {
    enum ProposalStatus {
        NONE,
        RESERVED,
        PAUSED_REVIEW,
        RELEASED,
        CANCELLED
    }

    enum InvoiceState {
        UNSEEN,
        RESERVED,
        CONSUMED
    }

    enum ReviewOutcome {
        NONE,
        DISMISSED_FALSE_POSITIVE,
        CONFIRMED_DUPLICATE
    }

    struct Campaign {
        string purpose;
        bytes32 allowedCategory;
        uint256 spendingCap;
    }

    struct Proposal {
        uint256 campaignId;
        uint256 amount;
        bytes32 category;
        bytes32 invoiceNullifier;
        bytes32 evidenceDigest;
        address vendor;
        address proposer;
        uint64 deadline;
        ProposalStatus status;
        uint8 approvalCount;
        ReviewOutcome reviewOutcome;
    }

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("CascadePurposeBoundEscrow");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant VENDOR_SPEND_TYPEHASH = keccak256(
        "VendorSpend(uint256 campaignId,uint256 amount,bytes32 category,bytes32 invoiceNullifier,bytes32 evidenceDigest,uint256 nonce,uint64 deadline)"
    );
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    uint256 public constant CAMPAIGN_ID = 1;
    address public immutable admin;
    address public immutable reviewer;
    address[3] public approvers;

    Campaign public campaign;
    mapping(address => bool) public vendorKeyActive;
    mapping(address => uint256) public vendorNonces;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(bytes32 => InvoiceState) public invoiceStates;
    mapping(bytes32 => uint256) public invoiceProposalIds;

    uint256 public nextProposalId;
    uint256 public reservedTotal;
    uint256 public releasedTotal;

    event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event VendorKeyStatusChanged(address indexed vendor, bool active);
    event SpendProposed(
        uint256 indexed proposalId,
        uint256 indexed campaignId,
        address indexed vendor,
        uint256 amount,
        bytes32 category,
        bytes32 invoiceNullifier,
        bytes32 evidenceDigest,
        ProposalStatus status
    );
    event SpendApproved(uint256 indexed proposalId, address indexed approver, uint8 approvalCount);
    event DuplicateInvoiceAttempt(
        uint256 indexed proposalId,
        bytes32 indexed invoiceNullifier,
        InvoiceState existingState,
        uint256 existingProposalId,
        address vendor
    );
    event SpendReleased(uint256 indexed proposalId, address indexed vendor, uint256 amount);
    event ReservationCancelled(uint256 indexed proposalId, bytes32 indexed invoiceNullifier);
    event ReviewResolved(uint256 indexed proposalId, address indexed reviewer, ReviewOutcome outcome);

    modifier onlyReviewer() {
        require(msg.sender == reviewer, "Not reviewer");
        _;
    }

    constructor(
        string memory purpose,
        bytes32 allowedCategory,
        uint256 spendingCap,
        address[3] memory authorizedApprovers,
        address reviewAddress
    ) {
        require(bytes(purpose).length > 0, "Purpose required");
        require(allowedCategory != bytes32(0), "Category required");
        require(spendingCap > 0, "Cap required");
        require(reviewAddress != address(0), "Reviewer required");

        for (uint256 i; i < authorizedApprovers.length; ++i) {
            require(authorizedApprovers[i] != address(0), "Approver required");
            for (uint256 j; j < i; ++j) {
                require(authorizedApprovers[i] != authorizedApprovers[j], "Approvers must differ");
            }
            approvers[i] = authorizedApprovers[i];
        }

        admin = msg.sender;
        reviewer = reviewAddress;
        campaign = Campaign({
            purpose: purpose,
            allowedCategory: allowedCategory,
            spendingCap: spendingCap
        });
    }

    function donate(uint256 campaignId) external payable {
        require(campaignId == CAMPAIGN_ID, "Unknown campaign");
        require(msg.value > 0, "Donation required");
        emit DonationReceived(campaignId, msg.sender, msg.value);
    }

    function campaignBalance(uint256 campaignId) external view returns (uint256) {
        require(campaignId == CAMPAIGN_ID, "Unknown campaign");
        return address(this).balance;
    }

    function availableBalance() public view returns (uint256) {
        return address(this).balance - reservedTotal;
    }

    function setVendorKeyStatus(address vendor, bool active) external {
        require(msg.sender == admin, "Not admin");
        require(vendor != address(0), "Vendor required");
        vendorKeyActive[vendor] = active;
        emit VendorKeyStatusChanged(vendor, active);
    }

    function proposeSpend(
        uint256 campaignId,
        uint256 amount,
        bytes32 category,
        bytes32 invoiceNullifier,
        bytes32 evidenceDigest,
        uint256 nonce,
        uint64 deadline,
        bytes calldata vendorSignature
    ) external returns (uint256 proposalId) {
        require(campaignId == CAMPAIGN_ID, "Unknown campaign");
        require(amount > 0, "Amount required");
        require(category == campaign.allowedCategory, "Wrong category");
        require(invoiceNullifier != bytes32(0), "Invoice nullifier required");
        require(evidenceDigest != bytes32(0), "Evidence digest required");
        require(deadline > block.timestamp, "Deadline must be future");

        address vendor = _recoverVendor(
            campaignId,
            amount,
            category,
            invoiceNullifier,
            evidenceDigest,
            nonce,
            deadline,
            vendorSignature
        );
        require(vendorNonces[vendor] == nonce, "Invalid vendor nonce");
        require(vendorKeyActive[vendor], "Vendor key inactive");
        vendorNonces[vendor] = nonce + 1;

        InvoiceState existingState = invoiceStates[invoiceNullifier];
        bool duplicate = existingState != InvoiceState.UNSEEN;
        if (!duplicate) {
            require(amount <= campaign.spendingCap, "Amount exceeds cap");
            require(releasedTotal + reservedTotal <= campaign.spendingCap - amount, "Spending cap exceeded");
            require(amount <= availableBalance(), "Insufficient balance");
        }

        proposalId = ++nextProposalId;
        ProposalStatus status = duplicate ? ProposalStatus.PAUSED_REVIEW : ProposalStatus.RESERVED;
        proposals[proposalId] = Proposal({
            campaignId: campaignId,
            amount: amount,
            category: category,
            invoiceNullifier: invoiceNullifier,
            evidenceDigest: evidenceDigest,
            vendor: vendor,
            proposer: msg.sender,
            deadline: deadline,
            status: status,
            approvalCount: 0,
            reviewOutcome: ReviewOutcome.NONE
        });

        _emitSpendProposed(proposalId);

        if (duplicate) {
            _emitDuplicateInvoiceAttempt(proposalId, existingState);
            return proposalId;
        }

        invoiceStates[invoiceNullifier] = InvoiceState.RESERVED;
        invoiceProposalIds[invoiceNullifier] = proposalId;
        reservedTotal += amount;
    }

    function approveSpend(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.RESERVED, "Proposal not approvable");
        require(block.timestamp <= proposal.deadline, "Reservation expired");
        require(vendorKeyActive[proposal.vendor], "Vendor key inactive");
        require(_isApprover(msg.sender), "Not approver");
        require(!hasApproved[proposalId][msg.sender], "Already approved");

        hasApproved[proposalId][msg.sender] = true;
        proposal.approvalCount += 1;
        emit SpendApproved(proposalId, msg.sender, proposal.approvalCount);
    }

    function releaseSpend(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.RESERVED, "Proposal not releasable");
        require(block.timestamp <= proposal.deadline, "Reservation expired");
        require(vendorKeyActive[proposal.vendor], "Vendor key inactive");
        require(proposal.approvalCount >= 2, "Two approvals required");

        proposal.status = ProposalStatus.RELEASED;
        reservedTotal -= proposal.amount;
        releasedTotal += proposal.amount;
        invoiceStates[proposal.invoiceNullifier] = InvoiceState.CONSUMED;

        (bool sent, ) = payable(proposal.vendor).call{value: proposal.amount}("");
        require(sent, "Vendor payment failed");

        emit SpendReleased(proposalId, proposal.vendor, proposal.amount);
    }

    function cancelOrExpireReservation(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.RESERVED, "Reservation not active");

        bool expired = block.timestamp > proposal.deadline;
        require(
            expired || msg.sender == proposal.proposer || msg.sender == reviewer,
            "Not authorized to cancel"
        );

        proposal.status = ProposalStatus.CANCELLED;
        reservedTotal -= proposal.amount;
        invoiceStates[proposal.invoiceNullifier] = InvoiceState.UNSEEN;
        invoiceProposalIds[proposal.invoiceNullifier] = 0;
        emit ReservationCancelled(proposalId, proposal.invoiceNullifier);
    }

    function resolveReview(uint256 proposalId, ReviewOutcome outcome) external onlyReviewer {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.PAUSED_REVIEW, "Proposal not under review");
        require(proposal.reviewOutcome == ReviewOutcome.NONE, "Review already resolved");
        require(
            outcome == ReviewOutcome.DISMISSED_FALSE_POSITIVE ||
                outcome == ReviewOutcome.CONFIRMED_DUPLICATE,
            "Invalid review outcome"
        );

        proposal.reviewOutcome = outcome;
        if (outcome == ReviewOutcome.DISMISSED_FALSE_POSITIVE) {
            proposal.status = ProposalStatus.CANCELLED;
        }
        emit ReviewResolved(proposalId, msg.sender, outcome);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function _isApprover(address account) private view returns (bool) {
        for (uint256 i; i < approvers.length; ++i) {
            if (approvers[i] == account) return true;
        }
        return false;
    }

    function _emitSpendProposed(uint256 proposalId) private {
        Proposal storage proposal = proposals[proposalId];
        emit SpendProposed(
            proposalId,
            proposal.campaignId,
            proposal.vendor,
            proposal.amount,
            proposal.category,
            proposal.invoiceNullifier,
            proposal.evidenceDigest,
            proposal.status
        );
    }

    function _emitDuplicateInvoiceAttempt(uint256 proposalId, InvoiceState existingState) private {
        Proposal storage proposal = proposals[proposalId];
        emit DuplicateInvoiceAttempt(
            proposalId,
            proposal.invoiceNullifier,
            existingState,
            invoiceProposalIds[proposal.invoiceNullifier],
            proposal.vendor
        );
    }

    function _recoverVendor(
        uint256 campaignId,
        uint256 amount,
        bytes32 category,
        bytes32 invoiceNullifier,
        bytes32 evidenceDigest,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) private view returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        require(uint256(s) <= SECP256K1_HALF_ORDER, "Invalid signature s");
        require(v == 27 || v == 28, "Invalid signature v");

        bytes32 structHash = keccak256(
            abi.encode(
                VENDOR_SPEND_TYPEHASH,
                campaignId,
                amount,
                category,
                invoiceNullifier,
                evidenceDigest,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "Invalid vendor signature");
        return signer;
    }

    function _domainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }
}
