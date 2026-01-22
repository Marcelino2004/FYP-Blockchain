// Check that the ABI matches the deployed contract
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🔍 Checking ABI Compatibility...\n");

  // Load deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.startsWith("localhost-") && f.endsWith(".json"));
  const latestFile = files.sort().reverse()[0];
  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8")
  );

  const lensAddress = deployment.contracts.lendingPoolLens;

  // Get the contract from Hardhat (correct ABI)
  const LendingPoolLens = await ethers.getContractFactory("LendingPoolLens");
  const lens = LendingPoolLens.attach(lensAddress);

  console.log("Testing with CORRECT ABI (from Hardhat):");
  try {
    const stats = await lens.getPlatformStats();
    console.log("  ✅ Works with Hardhat ABI!");
    console.log("     Result:", stats);
  } catch (e) {
    console.log("  ❌ Failed even with Hardhat ABI:", e.message);
  }

  // Now test with the frontend ABI
  console.log("\nTesting with FRONTEND ABI:");
  const frontendABI = [
    "function getPlatformStats() view returns (uint256 totalLoans, uint256 totalOffers, uint256 activeLenderOffers, uint256 activeBorrowerRequests, uint256 platformFeeRate)",
  ];

  const lensWithFrontendABI = new ethers.Contract(
    lensAddress,
    frontendABI,
    ethers.provider
  );

  try {
    const stats = await lensWithFrontendABI.getPlatformStats();
    console.log("  ✅ Works with frontend ABI!");
    console.log("     Result:", stats);
  } catch (e) {
    console.log("  ❌ Failed with frontend ABI:", e.message);
  }

  // Get the actual ABI from artifacts
  console.log("\n📋 Comparing ABIs...");
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "interfaces",
    "LendingPoolLens.sol",
    "LendingPoolLens.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const getPlatformStatsABI = artifact.abi.find(
    (item) => item.name === "getPlatformStats"
  );

  console.log("\nActual getPlatformStats ABI from contract:");
  console.log(JSON.stringify(getPlatformStatsABI, null, 2));

  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
