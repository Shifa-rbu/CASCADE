# CASCADE client

This is a local demo client for the synthetic evidence API. It creates a
synthetic PDF in the browser, uploads it to the API, computes SHA-256 over the
same bytes, and only displays a record when the browser and API digests match.

The client can connect to an injected browser wallet such as MetaMask using the
wallet's account-approval prompt. It displays the public account and selected
network and can request a switch to Polygon Amoy (chain ID 80002). Wallet
connection does not sign or send transactions. Signature and contract
duplicate status remain `UNVERIFIED`. Use synthetic demo data only.

## Run locally

From the repository root, start the API in one terminal:

```powershell
node server/src/index.mts
```

In another terminal, install the client dependencies once and start Vite:

```powershell
cd client
npm install
npm run dev
```

Open the local URL printed by Vite. The development server proxies `/api`
requests to `http://127.0.0.1:3001`.

To create a production bundle:

```powershell
npm run build
```

Run the wallet helper tests with:

```powershell
npm test
```
