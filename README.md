# CASCADE: Purpose-Bound Escrow & Audit Substrate for Adversarial Grants

CASCADE solves the **"Black Hole Ledger"** problem in humanitarian, CSR, and government grant funding (FCRA / 80G / CSR rules in India). When grant money is disbursed, siloed reporting enables rogue actors to submit the exact same invoice across multiple donor reports, or present forged receipts that no individual donor can cross-verify.

CASCADE provides an end-to-end, free-to-run local prototype featuring:
- **Direct MetaMask Integration:** Zero backend-held approver keys. Reviewers sign transactions directly with their own wallets.
- **Contract-Enforced Spending Policy:** Purpose-bound Solidity escrow on a local Hardhat EVM enforcing spending caps, categories, and **2-of-3 distinct multi-sig approvals**.
- **Non-Reverting Replay Protection (Hero Moment):** On-chain nullifier registry catches reused invoices across donor reports. Instead of reverting (which erases the transaction log), it durably halts the proposal under `PAUSED_REVIEW` so auditors have permanent proof of the incident.
- **Private Evidence Off-Chain:** Raw PDFs and beneficiary details stay private in a local git-ignored store. Only exact-byte SHA-256 digests and EIP-712 commitments touch the chain.
- **Simulated Bridge & Fiat Adapters:** Explicitly badged simulation legs demonstrating multi-hop cross-chain reconciliation and fiat off-ramp settlement without live banking dependencies.
- **30% Adversarial Synthetic Batch:** Evaluated against 10 synthetic receipts (including 1-byte alteration, forged vendor signatures, and duplicate replays) achieving 100% precision and recall.

---

## Architecture Overview & Views

```
Reviewer / Demo Approver Wallets
          │
          ▼
   React + TypeScript UI (Vite)
          │
          ├── Tab 1: 🏛️ NGO Operations (Campaign Finance, Propose Spend, 2-of-3 Multi-Sig, Release)
          ├── Tab 2: 🔍 Public Transparency (Immutable Provenance Trail, Simulated Legs, Trust Boundaries)
          ├── Tab 3: 📄 Evidence Studio (Private Upload, SHA-256 Digest Verification)
          └── Tab 4: 🛡️ Adversarial Audit (Live Duplicate Replay Attack, 30% Forgery Matrix)
          │
   MetaMask (EIP-1193 BrowserProvider)
          │  Direct signed transactions (proposeSpend, approveSpend, releaseSpend)
          ▼
   PurposeBoundEscrow (Local Hardhat EVM @ 127.0.0.1:8545 · Chain ID: 31337)
          │
          └── Express Synthetic Evidence API (@ 127.0.0.1:3001)
                ├── Local private file storage (%LOCALAPPDATA%\CASCADE\evidence)
                ├── SHA-256 byte digest calculation
                └── Safe allowlisted status response (no raw files or PII exposed)
```

---

## How to Run the Prototype (Step-by-Step)

Requirements: **Node.js >= 22.18.0** and npm. Run all commands from `CASCADE/` directory.

### Step 1: Install Dependencies (Once)

```powershell
cd C:\Users\hello\cascade\CASCADE
npm ci
npm --prefix client ci
```

### Step 2: Start Local Hardhat EVM Node (Terminal 1)

In Terminal 1:
```powershell
npm run dev:chain
```
*Leave this running.* It hosts the local blockchain at `http://127.0.0.1:8545` (Chain ID `31337`).

### Step 3: Deploy Escrow Contract & Seed Funds (Terminal 2)

In Terminal 2, set your MetaMask public wallet address as the active demo vendor and deploy:

```powershell
$env:DEMO_VENDOR_ADDRESS = "0xYOUR_PUBLIC_METAMASK_ADDRESS"
npm run deploy:local
Remove-Item Env:DEMO_VENDOR_ADDRESS
```
*(If you omit `DEMO_VENDOR_ADDRESS`, it defaults to the local Hardhat account #0).*

This script:
1. Deploys `PurposeBoundEscrow.sol` with a 20 ETH spending cap and allowed category `"community"`.
2. Donates a seeded grant of 10 ETH into the contract.
3. Automatically writes `VITE_ESCROW_ADDRESS` and `VITE_CHAIN_ID=31337` to `client/.env.local`.

### Step 4: Start the Synthetic Evidence API (Terminal 3)

In Terminal 3:
```powershell
node server/src/index.mts
```
*Leave this running.* It binds to `http://127.0.0.1:3001` and handles private file hashing.

### Step 5: Start the React Frontend (Terminal 4)

In Terminal 4:
```powershell
npm --prefix client run dev
```
Open the local URL printed by Vite (typically `http://localhost:5173`).

---

## Setting Up MetaMask for the Demo

1. In MetaMask, click the network dropdown and select **Add Network** → **Add a network manually**:
   - **Network name:** `Local Hardhat`
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency symbol:** `ETH`
2. Import Hardhat Test Accounts into MetaMask (for testing 2-of-3 approvals):
   - **Account #0 (Deployer / Proposer):** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - **Account #1 (Approver 1):** `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`
   - **Account #2 (Approver 2):** `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`
   - **Account #3 (Approver 3):** `0x7c852118294e51e653712a81e05800f419141751be58f6053764470f9363bef0`
   - **Account #4 (Reviewer):** `0x47e179ec197488593b100f80a30db70e8b4e983ac30e334582980e1af1516e77`

---

## Demo Walkthrough Guide (Judges Script)

### 1. Connect Wallet
- Click **"Connect Wallet"** on the top bar.
- Shows your connected address and `Local Hardhat · Chain ID 31337`.

### 2. Tab 1: NGO Operations
- **Inspect Campaign:** See Purpose, Spending Cap (20 ETH), Contract Balance (10 ETH), and Available Balance.
- **Propose a Spend:** Enter an amount (e.g. `0.01` ETH), fill invoice reference, and click **"Sign & Submit with Wallet"**. MetaMask prompts you to sign the typed EIP-712 payload and submit the transaction.
- **2-of-3 Multi-Sig Approvals:**
  - Select the new proposal. Click **"Approve Spend (MetaMask)"**. MetaMask confirms Approval 1 of 2.
  - Switch to Account #2 in MetaMask. Click **"Approve Spend (MetaMask)"**. Approval count reaches **2 of 2 (Threshold Reached)**!
- **Release Spend:** The **"Release Funds to Vendor"** button unlocks! Click it to execute payment on-chain. Status updates to `Funds Released on-chain`.

### 3. Tab 2: Public Transparency Explorer
- Explore the chronological audit trail:
  - `DONATION_RECEIVED` (10.00 ETH)
  - `SIMULATED_BRIDGE_LEG` (Cross-chain relayer with message ID)
  - `SIMULATED_FIAT_PAYOUT` (Off-ramp attestation in INR)
  - `SPEND_PROPOSED` → `SPEND_APPROVED` → `FUNDS_RELEASED`
- View transaction hashes, block numbers, gas used, and click between filter chips.
- Review the **"What This Proves & Does Not Prove"** panel.

### 4. Tab 3: Evidence Studio
- Click **"Create demo record"** to generate a synthetic invoice in memory.
- Verifies that browser-computed SHA-256 matches the API-computed digest byte-for-byte.

### 5. Tab 4: Adversarial Audit & Fraud Demo (The Hero Moment)
- **Live Replay Attack:** Click **"Simulate Live Replay Attack"**. Watch the contract detect the nullifier collision and durably freeze the proposal under `PAUSED_REVIEW` without reverting.
- **30% Forgery Matrix:** Review the 10-receipt evaluation table showing 100% precision and recall against injected cryptographic flaws and double-counting.

---

## Test & Build Verification

Run all test suites across smart contracts, API, and frontend:

```powershell
npm test
npm run build:client
```
- `test:contract`: 13 passing Mocha tests
- `test:api`: 5 passing Node test runner tests
- `test:client`: 9 passing unit tests
