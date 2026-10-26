import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  connectInjectedWallet,
  formatWalletError,
  getTargetChainName,
  getProviderErrorCode,
  LOCAL_HARDHAT_CHAIN_HEX,
  parseWalletAccount,
  parseWalletChainId,
  readInjectedWallet,
  shortenWalletAddress,
  switchToTargetChain,
  TARGET_CHAIN_ID,
} from "../src/wallet.ts";

const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678";

function mockProvider(responses = {}, errors = {}) {
  const calls = [];
  return {
    calls,
    async request({ method, params }) {
      calls.push({ method, params });
      const error = errors[method];
      if (Array.isArray(error)) {
        if (error.length > 0) throw error.shift();
      } else if (error) {
        throw error;
      }
      return responses[method];
    },
  };
}

describe("injected wallet helpers", () => {
  it("requests account approval and reads the selected chain", async () => {
    const provider = mockProvider({
      eth_requestAccounts: [ACCOUNT],
      eth_chainId: "0x13882",
    });

    assert.deepEqual(await connectInjectedWallet(provider), {
      account: ACCOUNT,
      chainId: 80002,
    });
    assert.deepEqual(provider.calls.map(({ method }) => method), [
      "eth_requestAccounts",
      "eth_chainId",
    ]);
  });

  it("does not treat an empty account list as a connection", async () => {
    const provider = mockProvider({
      eth_requestAccounts: [],
      eth_chainId: LOCAL_HARDHAT_CHAIN_HEX,
    });

    await assert.rejects(connectInjectedWallet(provider), /did not provide an account/);
  });

  it("reads an already-authorized account without prompting", async () => {
    const provider = mockProvider({
      eth_accounts: [ACCOUNT],
      eth_chainId: "0x1",
    });

    assert.deepEqual(await readInjectedWallet(provider), {
      account: ACCOUNT,
      chainId: 1,
    });
    assert.equal(provider.calls[0].method, "eth_accounts");
  });

  it("returns no connection when the wallet has not authorized an account", async () => {
    const provider = mockProvider({
      eth_accounts: [],
      eth_chainId: LOCAL_HARDHAT_CHAIN_HEX,
    });

    assert.equal(await readInjectedWallet(provider), null);
  });

  it("validates account and chain values", () => {
    assert.throws(() => parseWalletAccount("not-an-address"), /valid account address/);
    assert.throws(() => parseWalletChainId("80002"), /invalid network ID/);
    assert.equal(parseWalletChainId(LOCAL_HARDHAT_CHAIN_HEX), 31337);
    assert.equal(shortenWalletAddress(ACCOUNT), "0x1234…5678");
  });

  it("targets local Hardhat by default and adds it when the wallet does not know the chain", async () => {
    const provider = mockProvider(
      {},
      {
        wallet_switchEthereumChain: [Object.assign(new Error("Unknown chain"), {
          code: 4902,
        })],
      },
    );

    await switchToTargetChain(provider);
    assert.equal(TARGET_CHAIN_ID, 31337);
    assert.equal(getTargetChainName(), "Local Hardhat");
    assert.deepEqual(
      provider.calls.map(({ method }) => method),
      [
        "wallet_switchEthereumChain",
        "wallet_addEthereumChain",
        "wallet_switchEthereumChain",
      ],
    );
    assert.equal(
      provider.calls[1].params[0].chainId,
      LOCAL_HARDHAT_CHAIN_HEX,
    );
  });

  it("reports user-rejected wallet requests clearly", () => {
    const rejected = Object.assign(new Error("User rejected"), { code: 4001 });
    assert.equal(getProviderErrorCode(rejected), 4001);
    assert.match(formatWalletError(rejected), /rejected in your wallet/);
  });
});
