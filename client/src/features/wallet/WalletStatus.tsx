import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletSnapshot, WalletStatusProps } from "./walletTypes";

// Used only when the integrator has not supplied the deployment chain.
const LOCAL_HARDHAT_CHAIN_ID = 31337;

function toChainId(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : undefined;
  if (typeof value === "string") {
    const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

function normalizeAddress(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const address = value.trim().toLowerCase();
  return address || undefined;
}

export function WalletStatus({ expectedChainId = LOCAL_HARDHAT_CHAIN_ID, onChange }: WalletStatusProps) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot>({
    isConnected: false,
    isCorrectChain: false,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHiddenForSession, setIsHiddenForSession] = useState(false);
  const hiddenForSessionRef = useRef(false);
  const refreshVersionRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestVersion = refreshVersionRef.current + 1;
    refreshVersionRef.current = requestVersion;
    const isCurrentRequest = () =>
      !hiddenForSessionRef.current && refreshVersionRef.current === requestVersion;

    if (!isCurrentRequest()) return;
    const provider = window.ethereum;
    if (!provider) {
      if (!isCurrentRequest()) return;
      setSnapshot({ isConnected: false, isCorrectChain: false, error: "No injected wallet was detected." });
      return;
    }
    try {
      const rawAccounts = await provider.request({ method: "eth_accounts" });
      if (!isCurrentRequest()) return;
      const accounts = Array.isArray(rawAccounts) ? rawAccounts.map(normalizeAddress).filter((account): account is string => Boolean(account)) : [];
      const chainId = toChainId(await provider.request({ method: "eth_chainId" }));
      if (!isCurrentRequest()) return;
      setSnapshot({
        address: accounts[0],
        chainId,
        isConnected: Boolean(accounts[0]),
        isCorrectChain: chainId === expectedChainId,
      });
    } catch (error) {
      if (!isCurrentRequest()) return;
      setSnapshot({
        isConnected: false,
        isCorrectChain: false,
        error: error instanceof Error ? error.message : "Unable to read wallet state.",
      });
    }
  }, [expectedChainId]);

  useEffect(() => {
    void refresh();
    const provider = window.ethereum;
    if (!provider?.on) return undefined;
    const handleAccountsChanged = () => void refresh();
    const handleChainChanged = () => void refresh();
    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [refresh]);

  useEffect(() => onChange?.(snapshot), [onChange, snapshot]);

  const connect = async () => {
    hiddenForSessionRef.current = false;
    setIsHiddenForSession(false);
    const connectVersion = refreshVersionRef.current + 1;
    refreshVersionRef.current = connectVersion;
    const provider = window.ethereum;
    if (!provider) {
      setSnapshot((current) => ({ ...current, error: "Install or unlock an injected wallet to connect." }));
      return;
    }
    setIsConnecting(true);
    try {
      await provider.request({ method: "eth_requestAccounts" });
      if (hiddenForSessionRef.current || refreshVersionRef.current !== connectVersion) return;
      await refresh();
    } catch (error) {
      if (hiddenForSessionRef.current || refreshVersionRef.current !== connectVersion) return;
      setSnapshot((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Wallet connection was rejected.",
      }));
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    hiddenForSessionRef.current = true;
    setIsHiddenForSession(true);
    refreshVersionRef.current += 1;
    setSnapshot({ isConnected: false, isCorrectChain: false, error: "Disconnected in this session." });
  };

  return (
    <section className="ngo-wallet" aria-labelledby="wallet-heading">
      <div>
        <p className="ngo-eyebrow">Wallet</p>
        <h2 id="wallet-heading">Contract access</h2>
        {snapshot.error && <p className="ngo-error" role="alert">{snapshot.error}</p>}
        {snapshot.isConnected && !isHiddenForSession ? (
          <>
            <p className="ngo-mono">{snapshot.address}</p>
            <p className={snapshot.isCorrectChain ? "ngo-success" : "ngo-warning"}>
              {snapshot.isCorrectChain
                ? `Connected, chain ${snapshot.chainId}`
                : `Wrong network. Expected chain ${expectedChainId}; found ${snapshot.chainId ?? "unknown"}`}
            </p>
          </>
        ) : (
          <p className="ngo-muted">Connect a wallet to enable contract actions.</p>
        )}
      </div>
      {snapshot.isConnected && !isHiddenForSession ? (
        <button className="ngo-button ngo-button-secondary" type="button" onClick={disconnect}>
          Hide wallet for this session
        </button>
      ) : (
        <button className="ngo-button" type="button" onClick={() => void connect()} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect wallet"}
        </button>
      )}
      {isHiddenForSession && (
        <p className="ngo-help">
          Wallet hidden for this UI session. This does not revoke MetaMask permission.
        </p>
      )}
    </section>
  );
}

export type { WalletSnapshot, WalletStatusProps } from "./walletTypes";
