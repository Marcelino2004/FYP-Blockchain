/**
 * grant-verifier-role.js
 *
 * Run this script ONCE after deployment to grant VERIFIER_ROLE to your
 * backend wallet so it can call recordOffChainVerification().
 *
 * Usage:
 *   npx hardhat run scripts/grant-verifier-role.js --network localhost
 *
 * Or with a custom backend address:
 *   BACKEND_WALLET=0xYourAddress npx hardhat run scripts/grant-verifier-role.js --network localhost
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🔐 Granting VERIFIER_ROLE to Backend Wallet\n");
  console.log("=".repeat(60));

  // ── 1. Load deployer (account[0] = the DEFAULT_ADMIN who can grant roles)
  const [deployer] = await ethers.getSigners();
  console.log(`👤 Admin (deployer): ${deployer.address}`);

  // ── 2. Determine the backend wallet address
  //      Priority: BACKEND_WALLET env var → VERIFIER_PRIVATE_KEY derivation → account[1]
  let backendAddress;

  if (process.env.BACKEND_WALLET) {
    backendAddress = process.env.BACKEND_WALLET;
    console.log(
      `🔑 Backend wallet (from BACKEND_WALLET env): ${backendAddress}`,
    );
  } else if (process.env.VERIFIER_PRIVATE_KEY) {
    const wallet = new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY);
    backendAddress = wallet.address;
    console.log(
      `🔑 Backend wallet (derived from VERIFIER_PRIVATE_KEY): ${backendAddress}`,
    );
  } else {
    // Fallback: use Hardhat account[1] for local dev
    const signers = await ethers.getSigners();
    backendAddress = signers[1].address;
    console.log(`⚠️  No BACKEND_WALLET or VERIFIER_PRIVATE_KEY set.`);
    console.log(`   Defaulting to Hardhat account[1]: ${backendAddress}`);
    console.log(`   For production, set VERIFIER_PRIVATE_KEY in your .env`);
  }

  // ── 3. Load the latest deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(deploymentsDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0)
    throw new Error("No deployment file found in /deployments");

  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, files[0].name), "utf8"),
  );

  const reputationManagerAddress = deployment.contracts.reputationManager;
  console.log(`\n📋 ReputationManager: ${reputationManagerAddress}`);

  // ── 4. Attach to contract
  const ReputationManager =
    await ethers.getContractFactory("ReputationManager");
  const reputationManager = ReputationManager.attach(reputationManagerAddress);

  // ── 5. Get role identifier
  const VERIFIER_ROLE = await reputationManager.VERIFIER_ROLE();
  console.log(`\n🔏 VERIFIER_ROLE: ${VERIFIER_ROLE}`);

  // ── 6. Check if already granted
  const alreadyHasRole = await reputationManager.hasRole(
    VERIFIER_ROLE,
    backendAddress,
  );
  if (alreadyHasRole) {
    console.log(
      `\n✅ ${backendAddress} already has VERIFIER_ROLE. Nothing to do.`,
    );
    return;
  }

  // ── 7. Check deployer has admin role
  const DEFAULT_ADMIN_ROLE = await reputationManager.DEFAULT_ADMIN_ROLE();
  const isAdmin = await reputationManager.hasRole(
    DEFAULT_ADMIN_ROLE,
    deployer.address,
  );
  if (!isAdmin) {
    throw new Error(
      `Deployer ${deployer.address} does not have DEFAULT_ADMIN_ROLE`,
    );
  }

  // ── 8. Grant the role
  console.log(`\n⏳ Granting VERIFIER_ROLE to ${backendAddress}...`);
  const tx = await reputationManager.grantRole(VERIFIER_ROLE, backendAddress);
  await tx.wait();

  console.log(`✅ VERIFIER_ROLE granted! (tx: ${tx.hash})`);

  // ── 9. Verify
  const confirmed = await reputationManager.hasRole(
    VERIFIER_ROLE,
    backendAddress,
  );
  console.log(`\n🔍 Verified on-chain: hasRole = ${confirmed}`);

  console.log("\n" + "=".repeat(60));
  console.log(
    "✅ Done! Your backend can now call recordOffChainVerification()",
  );
  console.log("\n📝 Make sure your backend/.env contains:");
  console.log(`   VERIFIER_PRIVATE_KEY=<private key for ${backendAddress}>`);
  console.log("=".repeat(60) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Failed:", err.message);
    process.exit(1);
  });
