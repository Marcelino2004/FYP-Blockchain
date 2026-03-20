// scripts/full-restart.js - Complete deployment automation

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function runCommand(command, description) {
  console.log(`\n${description}...`);
  try {
    execSync(command, { stdio: "inherit" });
    console.log(`✅ ${description} complete`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

function updateEnvFile(deploymentPath) {
  console.log("\n📝 Updating frontend/.env...");

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contracts = deployment.contracts;

  const envPath = path.join(__dirname, "..", "frontend", ".env");
  let envContent = "";

  // Read existing .env if it exists
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }

  // Update contract addresses
  const updates = {
    VITE_REPUTATION_MANAGER: contracts.reputationManager,
    VITE_PRICE_ORACLE: contracts.priceOracle,
    VITE_COLLATERAL_MANAGER: contracts.collateralManager,
    VITE_LENDING_POOL: contracts.lendingPool,
    VITE_LENDING_POOL_LENS: contracts.lendingPoolLens,
    VITE_COSIGNING_MANAGER: contracts.coSigningManager,
  };

  // Update or add each variable
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent);

  console.log("\n✅ Updated contract addresses:");
  for (const [key, value] of Object.entries(updates)) {
    console.log(`   ${key}: ${value}`);
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 FULL RESTART & DEPLOYMENT");
  console.log("=".repeat(70));

  // Step 1: Check if Hardhat node is running
  console.log("\n📡 Checking network status...");
  const { execSync: exec } = require("child_process");
  try {
    exec(
      'curl -s http://127.0.0.1:8545 -X POST -H "Content-Type: application/json" --data \'{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}\'',
      { stdio: "pipe" }
    );
    console.log("✅ Hardhat node is running");
  } catch {
    console.log("❌ Hardhat node is NOT running");
    console.log("\n💡 Please start Hardhat node in a separate terminal:");
    console.log("   npx hardhat node");
    console.log("\n   Then run this script again.");
    process.exit(1);
  }

  // Step 2: Deploy contracts
  console.log("\n" + "=".repeat(70));
  if (
    !runCommand(
      "npx hardhat run scripts/deploy-local.js --network localhost",
      "📦 Deploying contracts"
    )
  ) {
    console.error("\n❌ Deployment failed. Exiting...");
    process.exit(1);
  }

  // Step 3: Get latest deployment file
  console.log("\n" + "=".repeat(70));
  console.log("\n📄 Finding latest deployment...");
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

  const latestDeployment = path.join(deploymentsDir, files[0].name);
  console.log(`✅ Latest deployment: ${files[0].name}`);

  // Step 4: Update frontend .env
  console.log("\n" + "=".repeat(70));
  updateEnvFile(latestDeployment);

  // Step 5: Test the deployment
  console.log("\n" + "=".repeat(70));
  console.log("\n🧪 Testing deployment...");
  runCommand(
    "npx hardhat run scripts/check-network.js --network localhost",
    "Running network check"
  );

  // Final summary
  console.log("\n" + "=".repeat(70));
  console.log("\n✅ DEPLOYMENT COMPLETE!");
  console.log("\n📋 Next Steps:");
  console.log("   1. Backend is ready to start:");
  console.log("      cd backend && npm start");
  console.log("");
  console.log("   2. Frontend is ready to start:");
  console.log("      cd frontend && npm run dev");
  console.log("");
  console.log("   3. Access the app at: http://localhost:3000");
  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
