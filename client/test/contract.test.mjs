import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getEscrowConfiguration,
  submitEvidenceProposal,
} from "../src/contract.ts";

describe("escrow client helpers", () => {
  it("reports missing deployment configuration instead of inventing an address", () => {
    assert.equal(getEscrowConfiguration(), null);
  });

  it("rejects a zero or malformed amount before requesting wallet access", async () => {
    const options = {
      provider: {
        async request() {
          assert.fail("The provider should not be contacted for an invalid amount.");
        },
      },
      account: "0x1234567890abcdef1234567890abcdef12345678",
      config: {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        chainId: 31337,
      },
      digest: `0x${"11".repeat(32)}`,
      onSubmitted() {},
    };

    await assert.rejects(
      submitEvidenceProposal({ ...options, amountEth: "0" }),
      /greater than zero/,
    );
    await assert.rejects(
      submitEvidenceProposal({ ...options, amountEth: "not-an-amount" }),
    );
  });
});
