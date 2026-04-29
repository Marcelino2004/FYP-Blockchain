// Verify that deployed contracts are working correctly
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🔍 Verifying Deployment...\n");

  // Load latest deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.startsWith("localhost-") && f.endsWith(".json"));

  if (files.length === 0) {
    console.error("❌ No localhost deployments found!");
    return;
  }

  const latestFile = files.sort().reverse()[0];
  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8")
  );

  console.log(`📄 Using: ${latestFile}\n`);

  // Get contract instances
  const lendingPool = await ethers.getContractAt(
    "LendingPool",
    deployment.contracts.lendingPool
  );

  const lendingPoolLens = await ethers.getContractAt(
    "LendingPoolLens",
    deployment.contracts.lendingPoolLens
  );

  console.log("Testing LendingPool functions...");

  // Test 1: nextLoanId
  try {
    const nextLoanId = await lendingPool.nextLoanId();
    console.log(`  ✅ nextLoanId: ${nextLoanId}`);
  } catch (e) {
    console.log(`  ❌ nextLoanId failed: ${e.message}`);
  }

  // Test 2: nextOfferId
  try {
    const nextOfferId = await lendingPool.nextOfferId();
    console.log(`  ✅ nextOfferId: ${nextOfferId}`);
  } catch (e) {
    console.log(`  ❌ nextOfferId failed: ${e.message}`);
  }

  // Test 3: platformFeeRate
  try {
    const feeRate = await lendingPool.platformFeeRate();
    console.log(`  ✅ platformFeeRate: ${feeRate}`);
  } catch (e) {
    console.log(`  ❌ platformFeeRate failed: ${e.message}`);
  }

  // Test 4: getActiveLenderOfferIds
  try {
    const ids = await lendingPool.getActiveLenderOfferIds();
    console.log(`  ✅ getActiveLenderOfferIds: ${ids.length} offers`);
  } catch (e) {
    console.log(`  ❌ getActiveLenderOfferIds failed: ${e.message}`);
  }

  // Test 5: getActiveBorrowerRequestIds
  try {
    const ids = await lendingPool.getActiveBorrowerRequestIds();
    console.log(`  ✅ getActiveBorrowerRequestIds: ${ids.length} requests`);
  } catch (e) {
    console.log(`  ❌ getActiveBorrowerRequestIds failed: ${e.message}`);
  }

  console.log("\nTesting LendingPoolLens...");

  // Test 6: LendingPoolLens.getPlatformStats
  try {
    const stats = await lendingPoolLens.getPlatformStats();
    console.log(`  ✅ getPlatformStats:`);
    console.log(`     Total Loans: ${stats[0]}`);
    console.log(`     Total Offers: ${stats[1]}`);
    console.log(`     Active Lender Offers: ${stats[2]}`);
    console.log(`     Active Borrower Requests: ${stats[3]}`);
    console.log(`     Platform Fee Rate: ${stats[4]}`);
  } catch (e) {
    console.log(`  ❌ getPlatformStats failed: ${e.message}`);
    console.log(`     Error details:`, e);
  }

  // Test 7: Check if pool address is correct
  try {
    const poolAddress = await lendingPoolLens.pool();
    console.log(`\n  ℹ️  LendingPoolLens.pool(): ${poolAddress}`);
    console.log(`  ℹ️  Expected: ${deployment.contracts.lendingPool}`);
    console.log(
      `  ${poolAddress.toLowerCase() === deployment.contracts.lendingPool.toLowerCase() ? "✅" : "❌"} Addresses match`
    );
  } catch (e) {
    console.log(`  ❌ pool() failed: ${e.message}`);
  }

  // Test 8: Check code at LendingPoolLens address
  const code = await ethers.provider.getCode(
    deployment.contracts.lendingPoolLens
  );
  console.log(
    `\n  ℹ️  Code at LendingPoolLens (${deployment.contracts.lendingPoolLens}):`
  );
  console.log(`     Length: ${code.length} bytes`);
  console.log(
    `     ${code === "0x" ? "❌ NO CONTRACT (0x)" : "✅ Contract exists"}`
  );

  console.log("\n" + "=".repeat(70) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
