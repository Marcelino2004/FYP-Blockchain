// scripts/mint-tokens.js
//
// Mints WETH, USDC, WBTC to one or more accounts without redeploying.
//
// Usage:
//   # Mint to all first 10 hardhat accounts (default)
//   npx hardhat run scripts/mint-tokens.js --network localhost
//
//   # Mint to specific hardhat account indices (0-based)
//   ACCOUNTS=0,1,6,7 npx hardhat run scripts/mint-tokens.js --network localhost
//
//   # Mint to a specific wallet address
//   ADDRESS=0xYourAddress npx hardhat run scripts/mint-tokens.js --network localhost

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("💰 TOKEN MINTING SCRIPT");
  console.log("=".repeat(60) + "\n");

  // ── 1. Load deployment info ──────────────────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(deploymentsDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) {
    throw new Error("No deployment file found. Run deploy-local.js first.");
  }

  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, files[0].name), "utf8"),
  );

  console.log("📄 Using deployment:", files[0].name);
  console.log(
    "   Tokens:",
    JSON.stringify(deployment.tokens, null, 2).replace(/\n/g, "\n   "),
  );
  console.log();

  // ── 2. Attach to mock token contracts ───────────────────────
  const weth = await ethers.getContractAt("MockERC20", deployment.tokens.WETH);
  const usdc = await ethers.getContractAt("MockERC20", deployment.tokens.USDC);
  const wbtc = await ethers.getContractAt("MockERC20", deployment.tokens.WBTC);

  // ── 3. Determine recipients ──────────────────────────────────
  const signers = await ethers.getSigners();
  let recipients = []; // { address, label }

  if (process.env.ADDRESS) {
    // Single specific address
    const addr = process.env.ADDRESS;
    if (!ethers.isAddress(addr)) {
      throw new Error(`Invalid address: ${addr}`);
    }
    recipients.push({ address: addr, label: addr });
    console.log("🎯 Mode: single address");
  } else if (process.env.ACCOUNTS) {
    // Comma-separated indices, e.g. "0,1,6,7"
    const indices = process.env.ACCOUNTS.split(",").map((s) =>
      parseInt(s.trim(), 10),
    );
    for (const i of indices) {
      if (i < 0 || i >= signers.length) {
        console.warn(
          `   ⚠️  Account index ${i} out of range (max ${signers.length - 1}), skipping`,
        );
        continue;
      }
      recipients.push({ address: signers[i].address, label: `account[${i}]` });
    }
    console.log(`🎯 Mode: specific account indices [${process.env.ACCOUNTS}]`);
  } else {
    // Default: first 10 accounts
    const count = Math.min(10, signers.length);
    for (let i = 0; i < count; i++) {
      recipients.push({ address: signers[i].address, label: `account[${i}]` });
    }
    console.log("🎯 Mode: first 10 hardhat accounts (default)");
  }

  console.log(`\n📬 Recipients (${recipients.length}):`);
  recipients.forEach(({ address, label }) =>
    console.log(`   ${label}: ${address}`),
  );

  // ── 4. Mint amounts ──────────────────────────────────────────
  const WETH_AMOUNT = ethers.parseEther("100"); // 100 WETH
  const USDC_AMOUNT = BigInt(100_000) * BigInt(1e6); // 100,000 USDC
  const WBTC_AMOUNT = BigInt(10) * BigInt(1e8); // 10 WBTC

  console.log("\n💸 Mint amounts per account:");
  console.log("   WETH: 100");
  console.log("   USDC: 100,000");
  console.log("   WBTC: 10");
  console.log();

  // ── 5. Mint ──────────────────────────────────────────────────
  for (const { address, label } of recipients) {
    process.stdout.write(`   Minting to ${label} (${address})... `);
    try {
      await (await weth.mint(address, WETH_AMOUNT)).wait();
      await (await usdc.mint(address, USDC_AMOUNT)).wait();
      await (await wbtc.mint(address, WBTC_AMOUNT)).wait();

      // Verify
      const wethBal = ethers.formatEther(await weth.balanceOf(address));
      const usdcBal = (
        Number(await usdc.balanceOf(address)) / 1e6
      ).toLocaleString();
      const wbtcBal = (Number(await wbtc.balanceOf(address)) / 1e8).toFixed(2);

      console.log("✅");
      console.log(
        `      WETH: ${wethBal} | USDC: ${usdcBal} | WBTC: ${wbtcBal}`,
      );
    } catch (err) {
      console.log("❌");
      console.error(`      Error: ${err.message}`);
    }
  }

  // ── 6. MetaMask instructions ─────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("✅ DONE — tokens minted on-chain.");
  console.log("=".repeat(60));
  console.log(`
📌 MetaMask won't show these tokens automatically.
   Add them manually in MetaMask:

   Network:  Hardhat Localhost (Chain ID 31337, RPC http://127.0.0.1:8545)

   Token 1 — WETH
     Contract: ${deployment.tokens.WETH}
     Symbol:   WETH
     Decimals: 18

   Token 2 — USDC
     Contract: ${deployment.tokens.USDC}
     Symbol:   USDC
     Decimals: 6

   Token 3 — WBTC
     Contract: ${deployment.tokens.WBTC}
     Symbol:   WBTC
     Decimals: 8

   In MetaMask: Assets tab → Import tokens → paste contract address
`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  });
