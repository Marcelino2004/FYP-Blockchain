// scripts/check-lens.js - Diagnose LendingPoolLens issue

const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Diagnosing LendingPoolLens Issue\n");
  console.log("=".repeat(70));

  // Get deployed addresses from your .env or hardcoded
  const LENDING_POOL_ADDRESS = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";
  const LENDING_POOL_LENS_ADDRESS =
    "0x610178dA211FEf7D417bC0e6FeD39F05609AD788";

  const [deployer] = await ethers.getSigners();

  // Connect to contracts
  const lendingPool = await ethers.getContractAt(
    "LendingPool",
    LENDING_POOL_ADDRESS
  );
  const lens = await ethers.getContractAt(
    "LendingPoolLens",
    LENDING_POOL_LENS_ADDRESS
  );

  console.log("\n📋 Contract Addresses:");
  console.log("   LendingPool:", LENDING_POOL_ADDRESS);
  console.log("   LendingPoolLens:", LENDING_POOL_LENS_ADDRESS);

  // Test 1: Check if LendingPool has the required functions
  console.log("\n🧪 Test 1: Checking LendingPool functions...");

  try {
    const nextLoanId = await lendingPool.nextLoanId();
    console.log("   ✅ nextLoanId():", nextLoanId.toString());
  } catch (err) {
    console.log("   ❌ nextLoanId() failed:", err.message);
  }

  try {
    const nextOfferId = await lendingPool.nextOfferId();
    console.log("   ✅ nextOfferId():", nextOfferId.toString());
  } catch (err) {
    console.log("   ❌ nextOfferId() failed:", err.message);
  }

  try {
    const lenderOffers = await lendingPool.getActiveLenderOfferIds();
    console.log("   ✅ getActiveLenderOfferIds():", lenderOffers.length);
  } catch (err) {
    console.log("   ❌ getActiveLenderOfferIds() failed:", err.message);
  }

  try {
    const borrowerRequests = await lendingPool.getActiveBorrowerRequestIds();
    console.log(
      "   ✅ getActiveBorrowerRequestIds():",
      borrowerRequests.length
    );
  } catch (err) {
    console.log("   ❌ getActiveBorrowerRequestIds() failed:", err.message);
  }

  try {
    const feeRate = await lendingPool.platformFeeRate();
    console.log("   ✅ platformFeeRate():", feeRate.toString());
  } catch (err) {
    console.log("   ❌ platformFeeRate() failed:", err.message);
  }

  // Test 2: Try calling getPlatformStats with detailed error
  console.log("\n🧪 Test 2: Calling getPlatformStats...");

  try {
    // Use staticCall to simulate the call without sending a transaction
    const result = await lens.getPlatformStats.staticCall();
    console.log("   ✅ Success!");
    console.log("   Total Loans:", result[0].toString());
    console.log("   Total Offers:", result[1].toString());
    console.log("   Active Lender Offers:", result[2].toString());
    console.log("   Active Borrower Requests:", result[3].toString());
    console.log("   Platform Fee Rate:", result[4].toString());
  } catch (err) {
    console.log("   ❌ Failed:");
    console.log("   Error:", err.message);

    // Try to get more details
    if (err.data) {
      console.log("   Error data:", err.data);
    }
    if (err.reason) {
      console.log("   Error reason:", err.reason);
    }
  }

  // Test 3: Check if lens.pool is set correctly
  console.log("\n🧪 Test 3: Checking lens configuration...");

  try {
    const poolAddress = await lens.pool();
    console.log("   ✅ lens.pool():", poolAddress);
    console.log("   Expected:", LENDING_POOL_ADDRESS);
    console.log(
      "   Match:",
      poolAddress.toLowerCase() === LENDING_POOL_ADDRESS.toLowerCase()
    );
  } catch (err) {
    console.log("   ❌ lens.pool() failed:", err.message);
  }

  // Test 4: Try calling each part separately
  console.log("\n🧪 Test 4: Testing individual calculations...");

  try {
    const nextLoanId = await lendingPool.nextLoanId();
    const totalLoans = nextLoanId - 1n;
    console.log("   ✅ Total Loans calculation:", totalLoans.toString());
  } catch (err) {
    console.log("   ❌ Total Loans calculation failed:", err.message);
  }

  try {
    const nextOfferId = await lendingPool.nextOfferId();
    const totalOffers = nextOfferId - 1n;
    console.log("   ✅ Total Offers calculation:", totalOffers.toString());
  } catch (err) {
    console.log("   ❌ Total Offers calculation failed:", err.message);
  }

  console.log("\n" + "=".repeat(70));
  console.log("\n💡 Diagnosis Tips:");
  console.log(
    "   1. If nextLoanId/nextOfferId fail: these must be public view functions"
  );
  console.log(
    "   2. If getActiveLenderOfferIds fails: function might not exist"
  );
  console.log(
    "   3. If lens.pool() doesn't match: LendingPoolLens was deployed with wrong address"
  );
  console.log(
    "   4. If all individual calls work but getPlatformStats fails: there's a visibility issue"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
