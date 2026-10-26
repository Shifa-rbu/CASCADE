# CASCADE client

This is a local demo client for the synthetic evidence API. It creates a
synthetic PDF in the browser, uploads it to the API, computes SHA-256 over the
same bytes, and only displays a record when the browser and API digests match.

The UI deliberately labels signature and contract duplicate status as
`UNVERIFIED`. It does not connect a wallet, submit a contract transaction, or
verify a vendor signature. Use synthetic demo data only.

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
