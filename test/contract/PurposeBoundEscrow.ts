import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const vendorSpendTypes = {
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

describe("PurposeBoundEscrow", function () {
  async function deployFixture() {
    const [admin, reviewer, approver1, approver2, approver3, vendor, donor, outsider] =
      await ethers.getSigners();
    const category = ethers.encodeBytes32String("community");
    const factory = await ethers.getContractFactory("PurposeBoundEscrow");
    const escrow = await factory.deploy(
      "Community support",
      category,
      ethers.parseEther("5"),
      [approver1.address, approver2.address, approver3.address],
      reviewer.address
    );
    await escrow.waitForDeployment();
    await escrow.setVendorKeyStatus(vendor.address, true);
    await escrow.connect(donor).donate(1, { value: ethers.parseEther("2") });
    return {
      escrow,
      admin,
      reviewer,
      approver1,
      approver2,
      approver3,
      vendor,
      donor,
      outsider,
      category,
    };
  }

  async function signProposal(
    escrow: Awaited<ReturnType<typeof deployFixture>>["escrow"],
    vendor: Awaited<ReturnType<typeof deployFixture>>["vendor"],
    options: {
      amount?: bigint;
      category?: string;
      invoiceNullifier?: string;
      evidenceDigest?: string;
      chainId?: bigint;
      verifyingContract?: string;
      signer?: typeof vendor;
      deadline?: number;
    } = {}
  ) {
    const networkInfo = await ethers.provider.getNetwork();
    const nonce = await escrow.vendorNonces(vendor.address);
    const deadline = options.deadline ?? (await time.latest()) + 3600;
    const typedDataDomain = {
      name: "CascadePurposeBoundEscrow",
      version: "1",
      chainId: options.chainId ?? networkInfo.chainId,
      verifyingContract: options.verifyingContract ?? (await escrow.getAddress()),
    };
    const value = {
      campaignId: 1n,
      amount: options.amount ?? ethers.parseEther("1"),
      category: options.category ?? ethers.encodeBytes32String("community"),
      invoiceNullifier:
        options.invoiceNullifier ??
        ethers.keccak256(ethers.toUtf8Bytes(`invoice-${nonce}-${Date.now()}`)),
      evidenceDigest:
        options.evidenceDigest ??
        ethers.keccak256(ethers.toUtf8Bytes(`evidence-${nonce}-${Date.now()}`)),
      nonce,
      deadline,
    };
    const signature = await (options.signer ?? vendor).signTypedData(
      typedDataDomain,
      vendorSpendTypes,
      value
    );
    return { nonce, deadline, signature, value };
  }

  async function propose(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    options: Parameters<typeof signProposal>[2] = {},
    submitter: Awaited<ReturnType<typeof deployFixture>>["outsider"] = fixture.outsider
  ) {
    const signed = await signProposal(fixture.escrow, fixture.vendor, options);
    const transaction = await fixture.escrow.connect(submitter).proposeSpend(
      1,
      signed.value.amount,
      signed.value.category,
      signed.value.invoiceNullifier,
      signed.value.evidenceDigest,
      signed.nonce,
      signed.deadline,
      signed.signature
    );
    await transaction.wait();
    return {
      proposalId: await fixture.escrow.nextProposalId(),
      transaction,
      ...signed,
    };
  }

  it("creates a purpose-bound campaign, accepts donations, and reports available balance", async function () {
    const { escrow, category } = await deployFixture();
    const campaign = await escrow.campaign();

    expect(campaign.purpose).to.equal("Community support");
    expect(campaign.allowedCategory).to.equal(category);
    expect(campaign.spendingCap).to.equal(ethers.parseEther("5"));
    expect(await escrow.campaignBalance(1)).to.equal(ethers.parseEther("2"));
    expect(await escrow.availableBalance()).to.equal(ethers.parseEther("2"));
    await expect(escrow.donate(2, { value: 1 })).to.be.revertedWith("Unknown campaign");
  });

  it("rejects wrong categories, spending above the cap, and insufficient available funds", async function () {
    const fixture = await deployFixture();
    const wrongCategory = ethers.encodeBytes32String("medical");
    const wrongCategorySignature = await signProposal(
      fixture.escrow,
      fixture.vendor,
      { category: wrongCategory }
    );
    await expect(
      fixture.escrow.proposeSpend(
        1,
        wrongCategorySignature.value.amount,
        wrongCategory,
        wrongCategorySignature.value.invoiceNullifier,
        wrongCategorySignature.value.evidenceDigest,
        wrongCategorySignature.nonce,
        wrongCategorySignature.deadline,
        wrongCategorySignature.signature
      )
    ).to.be.revertedWith("Wrong category");

    const overCap = await signProposal(fixture.escrow, fixture.vendor, {
      amount: ethers.parseEther("6"),
    });
    await expect(
      fixture.escrow.proposeSpend(
        1,
        overCap.value.amount,
        overCap.value.category,
        overCap.value.invoiceNullifier,
        overCap.value.evidenceDigest,
        overCap.nonce,
        overCap.deadline,
        overCap.signature
      )
    ).to.be.revertedWith("Amount exceeds cap");

    const insufficient = await signProposal(fixture.escrow, fixture.vendor, {
      amount: ethers.parseEther("3"),
    });
    await expect(
      fixture.escrow.proposeSpend(
        1,
        insufficient.value.amount,
        insufficient.value.category,
        insufficient.value.invoiceNullifier,
        insufficient.value.evidenceDigest,
        insufficient.nonce,
        insufficient.deadline,
        insufficient.signature
      )
    ).to.be.revertedWith("Insufficient balance");
    await fixture.escrow.donate(1, { value: ethers.parseEther("2") });
    const first = await propose(fixture, { amount: ethers.parseEther("3") });
    expect(await fixture.escrow.availableBalance()).to.equal(ethers.parseEther("1"));
    expect(first.proposalId).to.equal(1n);
  });

  it("enforces aggregate spending cap and available funds for each reservation", async function () {
    const fixture = await deployFixture();
    await fixture.escrow.donate(1, { value: ethers.parseEther("10") });
    await propose(fixture, {
      amount: ethers.parseEther("3"),
      invoiceNullifier: ethers.keccak256(ethers.toUtf8Bytes("first")),
    });

    await expect(
      propose(fixture, {
        amount: ethers.parseEther("3"),
        invoiceNullifier: ethers.keccak256(ethers.toUtf8Bytes("second")),
      })
    ).to.be.revertedWith("Spending cap exceeded");
    expect(await fixture.escrow.reservedTotal()).to.equal(ethers.parseEther("3"));
  });

  it("requires two distinct authorized approvers and pays only the signed vendor", async function () {
    const fixture = await deployFixture();
    const { proposalId } = await propose(fixture);
    const proposal = await fixture.escrow.proposals(proposalId);

    await expect(
      fixture.escrow.connect(fixture.outsider).approveSpend(proposalId)
    ).to.be.revertedWith("Not approver");
    await fixture.escrow.connect(fixture.approver1).approveSpend(proposalId);
    await expect(
      fixture.escrow.connect(fixture.approver1).approveSpend(proposalId)
    ).to.be.revertedWith("Already approved");
    await expect(fixture.escrow.releaseSpend(proposalId)).to.be.revertedWith(
      "Two approvals required"
    );

    const vendorBalanceBefore = await ethers.provider.getBalance(fixture.vendor.address);
    await fixture.escrow.connect(fixture.approver2).approveSpend(proposalId);
    await expect(fixture.escrow.releaseSpend(proposalId))
      .to.emit(fixture.escrow, "SpendReleased")
      .withArgs(proposalId, fixture.vendor.address, ethers.parseEther("1"));

    expect(await ethers.provider.getBalance(fixture.vendor.address)).to.equal(
      vendorBalanceBefore + ethers.parseEther("1")
    );
    expect((await fixture.escrow.proposals(proposalId)).status).to.equal(3n);
    expect(await fixture.escrow.invoiceStates(proposal.invoiceNullifier)).to.equal(2n);
    expect(await fixture.escrow.releasedTotal()).to.equal(ethers.parseEther("1"));
  });

  it("records duplicate attempts durably and prevents release while held", async function () {
    const fixture = await deployFixture();
    const original = await propose(fixture, {
      invoiceNullifier: ethers.keccak256(ethers.toUtf8Bytes("reserved-invoice")),
    });
    const duplicate = await propose(fixture, {
      amount: ethers.parseEther("6"),
      invoiceNullifier: original.value.invoiceNullifier,
    });

    expect((await fixture.escrow.proposals(duplicate.proposalId)).status).to.equal(2n);
    expect(await fixture.escrow.invoiceStates(original.value.invoiceNullifier)).to.equal(1n);
    expect(await fixture.escrow.reservedTotal()).to.equal(ethers.parseEther("1"));
    await expect(fixture.escrow.approveSpend(duplicate.proposalId)).to.be.revertedWith(
      "Proposal not approvable"
    );
    await expect(fixture.escrow.releaseSpend(duplicate.proposalId)).to.be.revertedWith(
      "Proposal not releasable"
    );

    await fixture.escrow.connect(fixture.reviewer).resolveReview(duplicate.proposalId, 2);
    expect((await fixture.escrow.proposals(duplicate.proposalId)).reviewOutcome).to.equal(2n);
    expect((await fixture.escrow.proposals(duplicate.proposalId)).status).to.equal(2n);
  });

  it("records a consumed-invoice replay without changing the prior payment or invoice state", async function () {
    const fixture = await deployFixture();
    const original = await propose(fixture, {
      invoiceNullifier: ethers.keccak256(ethers.toUtf8Bytes("paid-invoice")),
    });
    await fixture.escrow.connect(fixture.approver1).approveSpend(original.proposalId);
    await fixture.escrow.connect(fixture.approver2).approveSpend(original.proposalId);
    await fixture.escrow.releaseSpend(original.proposalId);

    const duplicate = await propose(fixture, {
      invoiceNullifier: original.value.invoiceNullifier,
    });
    await expect(duplicate.transaction).to.emit(fixture.escrow, "DuplicateInvoiceAttempt");

    expect(await fixture.escrow.invoiceStates(original.value.invoiceNullifier)).to.equal(2n);
    expect(await fixture.escrow.invoiceProposalIds(original.value.invoiceNullifier)).to.equal(
      original.proposalId
    );
    expect(await fixture.escrow.releasedTotal()).to.equal(ethers.parseEther("1"));
  });

  it("allows authorized cancellation to free an unpaid reservation while retaining its history", async function () {
    const fixture = await deployFixture();
    const proposal = await propose(fixture, {}, fixture.donor);

    await expect(
      fixture.escrow.connect(fixture.outsider).cancelOrExpireReservation(proposal.proposalId)
    ).to.be.revertedWith("Not authorized to cancel");
    await fixture.escrow.connect(fixture.donor).cancelOrExpireReservation(proposal.proposalId);

    expect((await fixture.escrow.proposals(proposal.proposalId)).status).to.equal(4n);
    expect(await fixture.escrow.invoiceStates(proposal.value.invoiceNullifier)).to.equal(0n);
    expect(await fixture.escrow.invoiceProposalIds(proposal.value.invoiceNullifier)).to.equal(0n);
  });

  it("lets anyone expire a reservation after its deadline", async function () {
    const fixture = await deployFixture();
    const deadline = (await time.latest()) + 30;
    const proposal = await propose(fixture, { deadline });

    await time.increaseTo(deadline + 1);
    await fixture.escrow.connect(fixture.outsider).cancelOrExpireReservation(proposal.proposalId);
    expect((await fixture.escrow.proposals(proposal.proposalId)).status).to.equal(4n);
    expect(await fixture.escrow.invoiceStates(proposal.value.invoiceNullifier)).to.equal(0n);
  });

  it("requires reviewer authorization and preserves false-positive resolution as a new event", async function () {
    const fixture = await deployFixture();
    const original = await propose(fixture, {
      invoiceNullifier: ethers.keccak256(ethers.toUtf8Bytes("review-invoice")),
    });
    const held = await propose(fixture, {
      invoiceNullifier: original.value.invoiceNullifier,
    });

    await expect(
      fixture.escrow.connect(fixture.outsider).resolveReview(held.proposalId, 1)
    ).to.be.revertedWith("Not reviewer");
    await fixture.escrow.connect(fixture.reviewer).cancelOrExpireReservation(original.proposalId);
    await expect(fixture.escrow.connect(fixture.reviewer).resolveReview(held.proposalId, 1))
      .to.emit(fixture.escrow, "ReviewResolved")
      .withArgs(held.proposalId, fixture.reviewer.address, 1);

    expect((await fixture.escrow.proposals(held.proposalId)).status).to.equal(4n);
    expect((await fixture.escrow.proposals(held.proposalId)).reviewOutcome).to.equal(1n);
    expect((await fixture.escrow.proposals(original.proposalId)).status).to.equal(4n);
  });

  it("enforces typed signature fields, domain, nonce, deadline, and active key status", async function () {
    const fixture = await deployFixture();
    const { value, nonce, deadline, signature } = await signProposal(
      fixture.escrow,
      fixture.vendor
    );
    await expect(
      fixture.escrow.proposeSpend(
        1,
        value.amount + 1n,
        value.category,
        value.invoiceNullifier,
        value.evidenceDigest,
        nonce,
        deadline,
        signature
      )
    ).to.be.revertedWith("Vendor key inactive");

    const wrongDomain = await signProposal(fixture.escrow, fixture.vendor, {
      verifyingContract: fixture.outsider.address,
    });
    await expect(
      fixture.escrow.proposeSpend(
        1,
        wrongDomain.value.amount,
        wrongDomain.value.category,
        wrongDomain.value.invoiceNullifier,
        wrongDomain.value.evidenceDigest,
        wrongDomain.nonce,
        wrongDomain.deadline,
        wrongDomain.signature
      )
    ).to.be.revertedWith("Vendor key inactive");

    const wrongChain = await signProposal(fixture.escrow, fixture.vendor, {
      chainId: 1n,
    });
    await expect(
      fixture.escrow.proposeSpend(
        1,
        wrongChain.value.amount,
        wrongChain.value.category,
        wrongChain.value.invoiceNullifier,
        wrongChain.value.evidenceDigest,
        wrongChain.nonce,
        wrongChain.deadline,
        wrongChain.signature
      )
    ).to.be.revertedWith("Vendor key inactive");

    const wrongSigner = await signProposal(fixture.escrow, fixture.vendor, {
      signer: fixture.outsider,
    });
    await expect(
      fixture.escrow.proposeSpend(
        1,
        wrongSigner.value.amount,
        wrongSigner.value.category,
        wrongSigner.value.invoiceNullifier,
        wrongSigner.value.evidenceDigest,
        wrongSigner.nonce,
        wrongSigner.deadline,
        wrongSigner.signature
      )
    ).to.be.revertedWith("Vendor key inactive");

    const correct = await propose(fixture);
    await expect(
      fixture.escrow.proposeSpend(
        1,
        correct.value.amount,
        correct.value.category,
        correct.value.invoiceNullifier,
        correct.value.evidenceDigest,
        correct.nonce,
        correct.deadline,
        correct.signature
      )
    ).to.be.revertedWith("Invalid vendor nonce");

    const expiredDeadline = (await time.latest()) - 1;
    const expired = await signProposal(fixture.escrow, fixture.vendor, {
      deadline: expiredDeadline,
    });
    await expect(
      fixture.escrow.proposeSpend(
        1,
        expired.value.amount,
        expired.value.category,
        expired.value.invoiceNullifier,
        expired.value.evidenceDigest,
        expired.nonce,
        expired.deadline,
        expired.signature
      )
    ).to.be.revertedWith("Deadline must be future");
  });

  it("blocks approval and release after a vendor key is revoked", async function () {
    const fixture = await deployFixture();
    const { proposalId } = await propose(fixture);
    await fixture.escrow.connect(fixture.approver1).approveSpend(proposalId);
    await expect(
      fixture.escrow.connect(fixture.outsider).setVendorKeyStatus(fixture.vendor.address, false)
    ).to.be.revertedWith("Not admin");
    await fixture.escrow.setVendorKeyStatus(fixture.vendor.address, false);

    await expect(
      fixture.escrow.connect(fixture.approver2).approveSpend(proposalId)
    ).to.be.revertedWith("Vendor key inactive");
    await expect(fixture.escrow.releaseSpend(proposalId)).to.be.revertedWith(
      "Vendor key inactive"
    );
  });

  it("rejects duplicate approver addresses at deployment", async function () {
    const { approver1, approver3, reviewer, category } = await deployFixture();
    const factory = await ethers.getContractFactory("PurposeBoundEscrow");

    await expect(
      factory.deploy(
        "Community support",
        category,
        ethers.parseEther("5"),
        [approver1.address, approver1.address, approver3.address],
        reviewer.address
      )
    ).to.be.revertedWith("Approvers must differ");
  });
});
