# CASCADE client

This client creates a synthetic PDF, uploads it to the local evidence API,
computes the same SHA-256 digest in the browser, and displays a record only
when the two digests match. It can connect to an injected wallet and submit a
signed proposal to the configured escrow contract.

The transaction is a real wallet-confirmed action on the selected chain. A
new proposal reserves campaign funds; the client does not release funds.
Signature and duplicate statuses from the API stay `UNVERIFIED`. The contract
detects exact digest replays, not edited or re-scanned documents, and does not
prove invoice authenticity.

For the complete Windows setup (local Hardhat, MetaMask, API, and Vite), follow
the [repository README](../README.md#windows-local-demo).

The Vite development server proxies `/api` to `http://127.0.0.1:3001`. Client
checks:

```powershell
npm test
npm run build
```
