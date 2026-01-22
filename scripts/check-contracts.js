// scripts/test-contracts.js - Test deployed contracts

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🧪 Testing Deployed Contracts\n");
  console.log("=".repeat(70));

  // Load latest deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(deploymentsDir, f)).mtime,
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) {
    console.error("❌ No deployment files found!");
    process.exit(1);
  }

  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, files[0].name), "utf8")
  );

  console.log(`\n📄 Using deployment: ${files[0].name}\n`);

  const addresses = deployment.contracts;

  // Test 1: Connect to LendingPool
  console.log("Test 1: LendingPool");
  try {
    const lendingPool = await ethers.getContractAt(
      "LendingPool",
      addresses.lendingPool
    );

    const nextLoanId = await lendingPool.nextLoanId();
    const nextOfferId = await lendingPool.nextOfferId();
    const feeRate = await lendingPool.platformFeeRate();

    console.log("   ✅ nextLoanId:", nextLoanId.toString());
    console.log("   ✅ nextOfferId:", nextOfferId.toString());
    console.log("   ✅ platformFeeRate:", feeRate.toString());
  } catch (err) {
    console.log("   ❌ Error:", err.message);
  }

  // Test 2: Connect to LendingPoolLens
  console.log("\nTest 2: LendingPoolLens");
  try {
    const lens = await ethers.getContractAt(
      "LendingPoolLens",
      addresses.lendingPoolLens
    );

    console.log("   📍 Address:", addresses.lendingPoolLens);

    // Check if contract exists
    const code = await ethers.provider.getCode(addresses.lendingPoolLens);
    console.log("   📦 Contract code exists:", code !== "0x");

    // Try to call pool()
    const poolAddress = await lens.pool();
    console.log("   ✅ lens.pool():", poolAddress);
    console.log(
      "   🔗 Matches LendingPool:",
      poolAddress.toLowerCase() === addresses.lendingPool.toLowerCase()
    );

    // Try to get platform stats
    const stats = await lens.getPlatformStats();
    console.log("   ✅ getPlatformStats() SUCCESS!");
    console.log("      Total Loans:", stats[0].toString());
    console.log("      Total Offers:", stats[1].toString());
    console.log("      Active Lender Offers:", stats[2].toString());
    console.log("      Active Borrower Requests:", stats[3].toString());
    console.log("      Platform Fee Rate:", stats[4].toString());
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    if (err.data) {
      console.log("   📊 Error data:", err.data);
    }
  }

  // Test 3: Test ReputationManager
  console.log("\nTest 3: ReputationManager");
  try {
    const reputationManager = await ethers.getContractAt(
      "ReputationManager",
      addresses.reputationManager
    );

    const [deployer] = await ethers.getSigners();
    const score = await reputationManager.getReputationScore(deployer.address);

    console.log("   ✅ Deployer reputation score:", score.toString());
  } catch (err) {
    console.log("   ❌ Error:", err.message);
  }

  // Test 4: Test CollateralManager
  console.log("\nTest 4: CollateralManager");
  try {
    const collateralManager = await ethers.getContractAt(
      "CollateralManager",
      addresses.collateralManager
    );

    const tokens = await collateralManager.getSupportedTokens();
    console.log("   ✅ Supported tokens:", tokens.length);

    for (const token of tokens) {
      const info = await collateralManager.getTokenInfo(token);
      console.log(`      - ${token}: supported=${info.isSupported}`);
    }
  } catch (err) {
    console.log("   ❌ Error:", err.message);
  }

  console.log("\n" + "=".repeat(70));
  console.log("\n✅ Contract testing complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
