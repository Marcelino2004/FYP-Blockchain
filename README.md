# RepProtocol: Building On-Chain Credit Through Reputation-Based Decentralized Lending

## Objective: Create a decentralized lending system that utilizes reputation as a form of creditworthiness to reduce overcollateralization while ensuring lender security and preventing manipulation of the credit system. 

## Main Contracts:

1. LendingPool - Manages all the lending and borrowing

2. ReputationManager - Calculates and updates the credit score

3. CoSigningManager - Creates and handles co-signing activities such as co-signing

4. CollateralManager - Handles all the collateral-related operations

5. PriceOracle - Wrapper contract for price feeds

This project is to be run locally in a hardhat node environment.

How to run:
1) (in a new terminal) yarn hardhat node 
2) (in a new terminal) yarn hardhat run scripts/deploy-local.js --network localhost
3) yarn hardhat run scripts/grant-verifier-role.js --network localhost
4) (in a new terminal) cd backend -> yarn run nodemon backend/server.js
5) (in a new terminal) cd frontend -> yarn run dev

To add mock tokens for local deployment:

1. Got to metamask and choose import account -> private key
2. Choose any of the first 10 accounts in hardhat node's private key to import
3. Connect to the localhost network
4. Import mock tokens WETH, WBTC, USDC (find address from deploy-local terminal)
