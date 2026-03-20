Objective:

1. Deposite collateral (using ETH/WETH)
2. Borrowing asset (DAI)
3. Repaying the borrowed asset

Contracts:

1. LendingPool - Manages all the lending and borrowing

2. ReputationManager - Calculates and updates the credit score

3. CoSigningManager - Creates and handles co-signing activities such as co-signing

4. CollateralManager - Handles all the collateral-related operations

5. PriceOracle - Fetches real time prices from Chainlink

How to run:

Sepolia

1. yarn hardhat run scripts/deploy-mocks.js --network sepolia

2. update deploy.js token address to the deployed mock addresses in step 1

3. yarn hardhat run scripts/deploy.js --network sepolia

4. Copy contract addresses from step 3 into frontend's env

5. (New terminal) cd backend + yarn run nodemon backend/server.js

6. (New terminal) cd frontend + yarn run dev

---

Locally

1. yarn hardhat node

2. (New terminal) yarn hardhat run scripts/deploy-local.js --network localhost

3. yarn hardhat run scripts/grant-verifier-role.js --network localhost

4. (New terminal) cd backend + yarn run nodemon backend/server.js

5. (New terminal) cd frontend + yarn run dev

To add mock tokens for local deployment:

1. Import private key of any of the first 10 accounts in hardhat node to metamask

2. Connect to the localhost network

3. Import mock tokens WETH, WBTC, USDC (from deploy-local terminal)
