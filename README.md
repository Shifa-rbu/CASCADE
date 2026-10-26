# CASCADE

CASCADE is a synthetic evidence and purpose-bound escrow prototype. The local
demo creates a clearly marked synthetic PDF, computes SHA-256 in both the
browser and API, and can submit a signed spend proposal to a local Hardhat
contract. The proposal reserves demo funds; it does not pay them.

The API reports signature and duplicate verification as `UNVERIFIED`.
On-chain exact-byte digest replay checks do not establish invoice authenticity
and do not recognize edited or re-scanned copies. The prototype does not
implement bridge/fiat provenance, zero-knowledge proofs, or impact verification.

## Windows local demo

Requirements: Node.js 22.18 or newer and npm. Run all commands from the
repository root in PowerShell. Use synthetic data only.

Install dependencies once:

```powershell
npm ci
npm --prefix client ci
```

Start the local Hardhat chain in Terminal 1:

```powershell
npm run dev:chain *> $null
```

Hardhat prints deterministic development signing keys by default. This command
suppresses that output; never use Hardhat development accounts or their keys
with real funds. Leave this terminal running. In Terminal 2, verify the local
chain is ready:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8545 -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

The result must contain `0x7a69` (chain ID 31337). Create or select a fresh
MetaMask test account and copy only its **public address**. Do not export or
share its private key or recovery phrase. In Terminal 2, set the public
address and deploy the demo contract locally:

```powershell
$env:DEMO_VENDOR_ADDRESS = "0xYOUR_PUBLIC_METAMASK_ADDRESS"
npm run deploy:local
Remove-Item Env:DEMO_VENDOR_ADDRESS
```

The script is restricted to chain ID 31337. It deploys the contract, marks
that public address as the active demo vendor, seeds the campaign with local
test ETH, and writes the contract address to the ignored
`client/.env.local`. It preserves other entries in that file. No Amoy or
mainnet transaction is made.

Start the API in Terminal 3:

```powershell
node server/src/index.mts
```

Start the client in Terminal 4:

```powershell
npm --prefix client run dev
```

Open the local URL printed by Vite. In MetaMask, add/select **Hardhat Local**
with RPC URL `http://127.0.0.1:8545`, chain ID `31337`, currency `ETH`.
Connect the same test account whose public address was supplied for deployment.
Create the demo record, review the displayed network and contract address, then
choose **Sign and submit proposal**. Approve the typed-data signature and
transaction in MetaMask. The UI reports pending/confirmed/failed status and
shows a transaction hash only after submission. Local hashes do not link to an
explorer.

To stop the local chain, press Ctrl+C in Terminal 1. Restart the deploy script
after restarting the chain, since a fresh local chain does not retain the
previous contract or account configuration.

## Checks

```powershell
npm test
npm run build:client
```

The local proposal uses an actual local-chain transaction when you run it in a
browser with MetaMask. Wallet connection and transaction submission have not
been live-tested against Polygon Amoy. Amoy is not required for the local demo;
do not deploy or broadcast to Amoy without explicit approval and a separate
verification of the contract, wallet, and test POL balance.
