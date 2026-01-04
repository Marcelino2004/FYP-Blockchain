//script to verify all contracts on etherscan

const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function verifyContract(address, constructorArgs, contractName) {
  console.log(`\n🔍 Verifying ${contractName}...`);
  try {
    await run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
    });
    console.log(`   ✅ ${contractName} verified!`);
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(`   ℹ️  ${contractName} already verified`);
    } else {
      console.error(
        `   ❌ ${contractName} verification failed:`,
        error.message
      );
    }
  }
}

async function main() {
  console.log("🔍 Starting Contract Verification\n");
  console.log("=".repeat(70));

  // Load latest deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs.readdirSync(deploymentsDir);
  const latestFile = files.sort().reverse()[0];

  if (!latestFile) {
    console.error("❌ No deployment file found!");
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8")
  );

  console.log(`\n📄 Using deployment: ${latestFile}`);
  console.log(`   Network: ${deploymentInfo.network}`);
  console.log(`   Deployed: ${deploymentInfo.timestamp}\n`);
  console.log("=".repeat(70));

  const { contracts, configuration } = deploymentInfo;

  // Wait for block confirmations
  console.log("\n⏳ Waiting for block confirmations...");
  await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds
  console.log("   ✅ Ready to verify\n");
  console.log("=".repeat(70));

  // Verify each contract
  await verifyContract(contracts.reputationManager, [], "ReputationManager");

  await verifyContract(contracts.priceOracle, [], "PriceOracle");

  await verifyContract(
    contracts.collateralManager,
    [contracts.priceOracle],
    "CollateralManager"
  );

  await verifyContract(
    contracts.lendingPool,
    [
      contracts.reputationManager,
      contracts.collateralManager,
      configuration.feeCollector,
    ],
    "LendingPool"
  );

  await verifyContract(
    contracts.coSigningManager,
    [contracts.reputationManager, contracts.lendingPool],
    "CoSigningManager"
  );

  console.log("\n" + "=".repeat(70));
  console.log("\n✅ VERIFICATION COMPLETE!\n");
  console.log("=".repeat(70));
  console.log("\n🌐 View contracts on Etherscan:");
  console.log(
    `   https://${deploymentInfo.network === "mainnet" ? "" : deploymentInfo.network + "."}etherscan.io/address/${contracts.reputationManager}\n`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
