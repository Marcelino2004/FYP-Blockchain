// scripts/check-network.js - Verify network connection

const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking Network Status\n");
  console.log("=".repeat(70));

  try {
    // Get network info
    const network = await ethers.provider.getNetwork();
    console.log("\n✅ Connected to network:");
    console.log("   Name:", network.name);
    console.log("   Chain ID:", network.chainId.toString());

    // Get block number
    const blockNumber = await ethers.provider.getBlockNumber();
    console.log("   Current Block:", blockNumber);

    // Get accounts (ethers v6)
    const signers = await ethers.getSigners();
    console.log("   Available Accounts:", signers.length);

    if (signers.length > 0) {
      console.log("   First Account:", signers[0].address);
    }

    // Test contract existence at your deployed addresses
    console.log("\n📋 Checking Deployed Contracts:");

    // Load latest deployment file
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
      console.log("   ⚠️  No deployment files found");
      return;
    }

    const latestDeployment = JSON.parse(
      fs.readFileSync(path.join(deploymentsDir, files[0].name), "utf8")
    );

    const addresses = {
      reputationManager: latestDeployment.contracts.reputationManager,
      priceOracle: latestDeployment.contracts.priceOracle,
      collateralManager: latestDeployment.contracts.collateralManager,
      lendingPool: latestDeployment.contracts.lendingPool,
      lendingPoolLens: latestDeployment.contracts.lendingPoolLens,
      coSigningManager: latestDeployment.contracts.coSigningManager,
    };

    for (const [name, address] of Object.entries(addresses)) {
      try {
        const code = await ethers.provider.getCode(address);
        const exists = code !== "0x";
        console.log(`   ${name}:`, exists ? "✅ EXISTS" : "❌ NOT FOUND");
        if (!exists) {
          console.log(`      Address: ${address}`);
          console.log(`      Code: ${code}`);
        }
      } catch (err) {
        console.log(`   ${name}: ❌ ERROR -`, err.message);
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("\n💡 Next Steps:");

    if (blockNumber === 0) {
      console.log(
        "   ⚠️  WARNING: Block number is 0. Node might have restarted."
      );
      console.log("   → Run: npm run deploy:local");
    } else {
      const code = await ethers.provider.getCode(addresses.lendingPool);
      if (code === "0x") {
        console.log(
          "   ⚠️  WARNING: Contracts not found at expected addresses."
        );
        console.log("   → Run: npm run deploy:local");
      } else {
        console.log("   ✅ Everything looks good!");
      }
    }
  } catch (error) {
    console.error("\n❌ Connection failed:");
    console.error("   Error:", error.message);
    console.log("\n💡 Possible issues:");
    console.log("   1. Hardhat node is not running");
    console.log("   2. Wrong RPC URL in hardhat.config.js");
    console.log("\n   → Start Hardhat node: npx hardhat node");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
