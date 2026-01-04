//helper script to interact with deployed contracts

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function loadDeployment() {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs.readdirSync(deploymentsDir);
  const latestFile = files.sort().reverse()[0];

  return JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8")
  );
}

async function main() {
  const deployment = await loadDeployment();
  const [deployer] = await ethers.getSigners();

  console.log("🔗 Connecting to deployed contracts...\n");

  // Connect to contracts
  const reputationManager = await ethers.getContractAt(
    "ReputationManager",
    deployment.contracts.reputationManager
  );

  const lendingPool = await ethers.getContractAt(
    "LendingPool",
    deployment.contracts.lendingPool
  );

  const collateralManager = await ethers.getContractAt(
    "CollateralManager",
    deployment.contracts.collateralManager
  );

  const coSigningManager = await ethers.getContractAt(
    "CoSigningManager",
    deployment.contracts.coSigningManager
  );

  // Example: Check deployer's reputation
  console.log("📊 Checking reputation...");
  const reputation = await reputationManager.getReputationScore(
    deployer.address
  );
  console.log(`   Deployer reputation: ${reputation}\n`);

  // Example: Get active loan offers
  console.log("📋 Checking active offers...");
  const lenderOffers = await lendingPool.getActiveLenderOffers();
  const borrowerRequests = await lendingPool.getActiveBorrowerRequests();
  console.log(`   Lender offers: ${lenderOffers.length}`);
  console.log(`   Borrow requests: ${borrowerRequests.length}\n`);

  // Example: Get supported collateral tokens
  console.log("💎 Supported collateral tokens:");
  const supportedTokens = await collateralManager.getSupportedTokens();
  for (const token of supportedTokens) {
    const tokenInfo = await collateralManager.getTokenInfo(token);
    console.log(
      `   ${token}: Max ${ethers.formatUnits(tokenInfo.maxDepositAmount, 18)} tokens`
    );
  }

  console.log("\n✅ Interaction complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
