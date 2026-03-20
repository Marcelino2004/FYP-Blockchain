// Script to show the latest deployed contract addresses
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentsDir = path.join(__dirname, "..", "deployments");

  if (!fs.existsSync(deploymentsDir)) {
    console.error("❌ No deployments folder found!");
    return;
  }

  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.startsWith("localhost-") && f.endsWith(".json"));

  if (files.length === 0) {
    console.error("❌ No localhost deployment files found!");
    console.log("Available files:", fs.readdirSync(deploymentsDir));
    return;
  }

  const latestFile = files.sort().reverse()[0];

  if (!latestFile) {
    console.error("❌ No deployment files found!");
    return;
  }

  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8")
  );

  console.log("\n" + "=".repeat(70));
  console.log("📋 LATEST DEPLOYMENT ADDRESSES");
  console.log("=".repeat(70));
  console.log(`\nFile: ${latestFile}`);
  console.log(`Network: ${deployment.network}`);
  console.log(`Deployed: ${deployment.timestamp}\n`);

  console.log("📝 Copy these to your frontend/.env:\n");
  console.log("# Contract Addresses");
  console.log(
    `VITE_REPUTATION_MANAGER=${deployment.contracts.reputationManager}`
  );
  console.log(`VITE_PRICE_ORACLE=${deployment.contracts.priceOracle}`);
  console.log(
    `VITE_COLLATERAL_MANAGER=${deployment.contracts.collateralManager}`
  );
  console.log(`VITE_LENDING_POOL=${deployment.contracts.lendingPool}`);
  console.log(`VITE_LENDING_POOL_LENS=${deployment.contracts.lendingPoolLens}`);
  console.log(
    `VITE_COSIGNING_MANAGER=${deployment.contracts.coSigningManager}`
  );

  if (deployment.tokens) {
    console.log("\n# Token Addresses (for reference)");
    Object.entries(deployment.tokens).forEach(([name, address]) => {
      console.log(`# ${name}: ${address}`);
    });
  }

  console.log("\n" + "=".repeat(70) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
