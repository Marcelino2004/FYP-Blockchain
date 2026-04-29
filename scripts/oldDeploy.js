const { ethers } = require("hardhat");

async function main() {
  console.log("Starting deployment...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log(
    "Account balance:",
    (await deployer.provider.getBalance(deployer.address)).toString(),
    "\n"
  );

  // Deploy ReputationManager
  console.log("Deploying ReputationManager...");
  const ReputationManager =
    await ethers.getContractFactory("ReputationManager");
  const reputationManager = await ReputationManager.deploy();
  await reputationManager.waitForDeployment();

  const reputationManagerAddress = await reputationManager.getAddress();
  console.log("✅ ReputationManager deployed to:", reputationManagerAddress);

  // Get role identifiers
  const LENDING_POOL_ROLE = await reputationManager.LENDING_POOL_ROLE();
  const COSIGNING_ROLE = await reputationManager.COSIGNING_ROLE();
  const VERIFIER_ROLE = await reputationManager.VERIFIER_ROLE();

  console.log("\n📋 Role Identifiers:");
  console.log("LENDING_POOL_ROLE:", LENDING_POOL_ROLE);
  console.log("COSIGNING_ROLE:", COSIGNING_ROLE);
  console.log("VERIFIER_ROLE:", VERIFIER_ROLE);

  // Optional: Grant roles to specific addresses (uncomment and update addresses)
  /*
  console.log("\n🔐 Granting roles...");
  
  const lendingPoolAddress = "0x..."; // Update with actual address
  const coSigningManagerAddress = "0x..."; // Update with actual address
  const verifierAddress = "0x..."; // Update with actual address

  await reputationManager.grantRole(LENDING_POOL_ROLE, lendingPoolAddress);
  console.log("✅ LENDING_POOL_ROLE granted to:", lendingPoolAddress);

  await reputationManager.grantRole(COSIGNING_ROLE, coSigningManagerAddress);
  console.log("✅ COSIGNING_ROLE granted to:", coSigningManagerAddress);

  await reputationManager.grantRole(VERIFIER_ROLE, verifierAddress);
  console.log("✅ VERIFIER_ROLE granted to:", verifierAddress);
  */

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    reputationManager: reputationManagerAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    roles: {
      LENDING_POOL_ROLE,
      COSIGNING_ROLE,
      VERIFIER_ROLE,
    },
  };

  console.log("\n📄 Deployment Summary:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Verify constants
  console.log("\n🔍 Contract Constants:");
  console.log(
    "MIN_REPUTATION:",
    (await reputationManager.MIN_REPUTATION()).toString()
  );
  console.log(
    "MAX_REPUTATION:",
    (await reputationManager.MAX_REPUTATION()).toString()
  );
  console.log(
    "STARTING_REPUTATION:",
    (await reputationManager.STARTING_REPUTATION()).toString()
  );
  console.log(
    "EMAIL_VERIFICATION_BONUS:",
    (await reputationManager.EMAIL_VERIFICATION_BONUS()).toString()
  );
  console.log(
    "PHONE_VERIFICATION_BONUS:",
    (await reputationManager.PHONE_VERIFICATION_BONUS()).toString()
  );

  // If on testnet, verify on Etherscan
  if (network.name === "sepolia") {
    console.log("\n⏳ Waiting for block confirmations before verification...");
    await reputationManager.deploymentTransaction().wait(6);

    console.log("🔍 Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: reputationManagerAddress,
        constructorArguments: [],
      });
      console.log("✅ Contract verified on Etherscan");
    } catch (error) {
      console.log("❌ Verification failed:", error.message);
    }
  }

  console.log("\n✅ Deployment completed successfully!");
  console.log("\n💡 Next steps:");
  console.log(
    "1. Grant roles to other contracts (LendingPool, CoSigningManager, Verifier)"
  );
  console.log("2. Initialize users who want to participate");
  console.log("3. Test the system with small amounts first");

  return deploymentInfo;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
