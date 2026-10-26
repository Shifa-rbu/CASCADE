export const POLYGON_AMOY_CHAIN_ID = 80_002;
export const POLYGON_AMOY_CHAIN_HEX = "0x13882";

export interface WalletConnection {
  account: `0x${string}`;
  chainId: number;
}

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(
    event: "accountsChanged" | "chainChanged",
    listener: (value: unknown) => void,
  ): void;
  removeListener?(
    event: "accountsChanged" | "chainChanged",
    listener: (value: unknown) => void,
  ): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function getInjectedWallet(): Eip1193Provider | undefined {
  return typeof window === "undefined" ? undefined : window.ethereum;
}

export function parseWalletChainId(value: unknown): number {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error("The wallet returned an invalid network ID.");
  }
  const chainId = Number.parseInt(value.slice(2), 16);
  if (!Number.isSafeInteger(chainId)) {
    throw new Error("The wallet returned an unsupported network ID.");
  }
  return chainId;
}

export function parseWalletAccount(value: unknown): `0x${string}` {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-f]{40}$/i.test(value)
  ) {
    throw new Error("The wallet did not return a valid account address.");
  }
  return value as `0x${string}`;
}

export async function connectInjectedWallet(
  provider: Eip1193Provider,
): Promise<WalletConnection> {
  const accounts: unknown = await provider.request({
    method: "eth_requestAccounts",
  });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("The wallet did not provide an account.");
  }

  const chain: unknown = await provider.request({ method: "eth_chainId" });
  return {
    account: parseWalletAccount(accounts[0]),
    chainId: parseWalletChainId(chain),
  };
}

export async function readInjectedWallet(
  provider: Eip1193Provider,
): Promise<WalletConnection | null> {
  const [accounts, chain]: [unknown, unknown] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  return {
    account: parseWalletAccount(accounts[0]),
    chainId: parseWalletChainId(chain),
  };
}

export async function switchToPolygonAmoy(
  provider: Eip1193Provider,
): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: POLYGON_AMOY_CHAIN_HEX }],
    });
  } catch (error) {
    if (getProviderErrorCode(error) !== 4902) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: POLYGON_AMOY_CHAIN_HEX,
        chainName: "Polygon Amoy",
        nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
        rpcUrls: ["https://rpc-amoy.polygon.technology"],
        blockExplorerUrls: ["https://amoy.polygonscan.com/"],
      }],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: POLYGON_AMOY_CHAIN_HEX }],
    });
  }
}

export function getProviderErrorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "number" ? error.code : undefined;
}

export function formatWalletError(error: unknown): string {
  if (getProviderErrorCode(error) === 4001) {
    return "The request was rejected in your wallet. Approve it there to continue.";
  }
  if (error instanceof Error) return error.message;
  return "The wallet request failed. Check your wallet and try again.";
}

export function shortenWalletAddress(account: string): string {
  return `${account.slice(0, 6)}…${account.slice(-4)}`;
}
