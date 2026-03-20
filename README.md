# RepChain - Decentralized Reputation Lending Platform

A peer-to-peer lending platform powered by on-chain reputation scores, collateral management, and co-signing.

---
## Main Contracts:

1. LendingPool - Manages all the lending and borrowing

2. ReputationManager - Calculates and updates the credit score

3. CoSigningManager - Creates and handles co-signing activities such as co-signing

4. CollateralManager - Handles all the collateral-related operations

5. PriceOracle - Wrapper contract for price feeds

This project is to be run locally in a hardhat node environment.
---

## Prerequisites

Before starting, make sure you have the following installed:

- [Node.js v20+](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/) — install with `npm install -g yarn`
- [MetaMask](https://metamask.io/) browser extension

---

## Installation

### 1. Install root dependencies
```bash
yarn install
```

### 2. Install frontend dependencies
```bash
cd frontend
yarn install
cd ..
```

### 3. Set up environment files

Create a `.env` file at the **root** of the project:
```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=YOUR_DEPLOYER_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
VERIFIER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

PORT=3001
HOST=0.0.0.0
NODE_ENV=development

NETWORK=localhost
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
CONFIRMATIONS=1

API_BASE_URL=http://localhost:3001
CORS_ORIGIN=*
FRONTEND_URL=http://localhost:8545

LOG_LEVEL=info
LOG_FORMAT=combined

CACHE_ENABLED=false
CACHE_TTL=60
```

Create a `.env` file inside the **`frontend/`** folder:
```env
VITE_API_URL=http://localhost:3001
VITE_NETWORK_NAME=localhost
VITE_CHAIN_ID=31337

VITE_REPUTATION_MANAGER=0x0165878A594ca255338adfa4d48449f69242Eb8F
VITE_PRICE_ORACLE=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
VITE_COLLATERAL_MANAGER=0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
VITE_LENDING_POOL=0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
VITE_LENDING_POOL_LENS=0x610178dA211FEF7D417bC0e6FeD39F05609AD788
VITE_COSIGNING_MANAGER=0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e

VITE_RPC_URL=http://localhost:8545
```

---

## Running the Project Locally

You will need **4 separate terminals** open at the root of the project.

### Terminal 1 — Start Hardhat Node
```bash
yarn hardhat node
```
Wait until you see the list of accounts and the message:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

---

### Terminal 2 — Deploy Contracts
```bash
yarn hardhat run scripts/deploy-local.js --network localhost
```
Wait until deployment completes. The contract addresses printed should match those already in `frontend/.env`.

---

### Terminal 2 — Grant Verifier Role
```bash
yarn hardhat run scripts/grant-verifier-role.js --network localhost
```
You should see:
```
✅ VERIFIER_ROLE granted!
```

---

### Terminal 2 — Mint Test Tokens
```bash
yarn hardhat run scripts/mint-tokens.js --network localhost
```
This mints WETH, USDC, and WBTC to the first 10 Hardhat accounts.

---

### Terminal 3 — Start Backend
```bash
cd backend
yarn run nodemon backend/server.js 
```
Wait until you see:
```
✅ Backend server running!
```

---

### Terminal 4 — Start Frontend
```bash
cd frontend
yarn run dev
```
Open your browser at [http://localhost:5173](http://localhost:5173).

---

## MetaMask Setup

### Add Hardhat Local Network

In MetaMask, go to **Settings → Networks → Add Network** and enter:

| Field | Value |
|---|---|
| Network Name | Hardhat |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency Symbol | ETH |

### Import a Test Account

In MetaMask, go to **Import Account** and paste one of the private keys printed by `yarn node:start`.

The default account[0] private key is:
```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Import Mock Tokens

In MetaMask, go to **Assets → Import Tokens** and add each token:

| Token | Contract Address | Decimals |
|---|---|---|
| WETH | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | 18 |
| USDC | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | 6 |
| WBTC | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` | 8 |

---

## Important Notes

- **Every time you restart the Hardhat node**, you must re-run Terminals 2, 3, and 4 — the chain resets completely on restart.
- **If MetaMask shows a nonce error** after a chain reset, go to **Settings → Advanced → Clear activity and nonce data**.
- The `VERIFIER_PRIVATE_KEY` in `.env` corresponds to Hardhat's default **account[1]** — this is the backend signer used to write on-chain verification records.

---

## Available Scripts

| Command | Description |
|---|---|
| `yarn node:start` | Start local Hardhat node |
| `yarn deploy:local` | Deploy contracts to local network |
| `yarn backend:dev` | Start backend server with hot reload |
| `yarn backend:start` | Start backend server (no hot reload) |
| `cd frontend && yarn dev` | Start frontend dev server |
