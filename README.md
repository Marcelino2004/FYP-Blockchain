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

3. yarn hardhat run scripts/deploy.js --network localhost

4. cd backend + yarn run nodemon backend/server.js

5. cd .. + cd frontenc + yarn run dev

Locally

1. yarn hardhat node

2. yarn hardhat run scripts/deploy-local.js --network localhost

3. cd backend + yarn run nodemon backend/server.js

4. cd .. + cd frontend + yarn run dev
