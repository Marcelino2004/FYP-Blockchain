// deploy to local hardhat network with mock tokens

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying to Local Hardhat Network with Mocks\n");

  const signers = await ethers.getSigners();
  const deployer = signers[0];

  console.log("Deployer:", deployer.address);

  // ─────────────────────────────────────────────────────────────
  // 1. Deploy mock tokens
  // ─────────────────────────────────────────────────────────────
  console.log("\n📦 Deploying Mock Tokens...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");

  const weth = await MockERC20.deploy("Wrapped ETH", "WETH", 18);
  await weth.waitForDeployment();
  console.log("   ✅ WETH:", await weth.getAddress());

  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  console.log("   ✅ USDC:", await usdc.getAddress());

  const wbtc = await MockERC20.deploy("Wrapped BTC", "WBTC", 8);
  await wbtc.waitForDeployment();
  console.log("   ✅ WBTC:", await wbtc.getAddress());

  // ─────────────────────────────────────────────────────────────
  // 2. Deploy mock price feeds
  // ─────────────────────────────────────────────────────────────
  console.log("\n📦 Deploying Mock Price Feeds...");
  const MockAggregator = await ethers.getContractFactory("MockV3Aggregator");

  const ethPriceFeed = await MockAggregator.deploy(8, 300000000000); // $3000
  await ethPriceFeed.waitForDeployment();
  console.log("   ✅ ETH/USD:", await ethPriceFeed.getAddress());

  const usdcPriceFeed = await MockAggregator.deploy(8, 100000000); // $1
  await usdcPriceFeed.waitForDeployment();
  console.log("   ✅ USDC/USD:", await usdcPriceFeed.getAddress());

  const btcPriceFeed = await MockAggregator.deploy(8, 10000000000000); // $100000
  await btcPriceFeed.waitForDeployment();
  console.log("   ✅ BTC/USD:", await btcPriceFeed.getAddress());

  // ─────────────────────────────────────────────────────────────
  // 3. Deploy main contracts
  // ─────────────────────────────────────────────────────────────
  console.log("\n📦 Deploying Main Contracts...");

  const ReputationManager =
    await ethers.getContractFactory("ReputationManager");
  const reputationManager = await ReputationManager.deploy();
  await reputationManager.waitForDeployment();
  console.log("   ✅ ReputationManager:", await reputationManager.getAddress());

  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy();
  await priceOracle.waitForDeployment();
  console.log("   ✅ PriceOracle:", await priceOracle.getAddress());

  const CollateralManager =
    await ethers.getContractFactory("CollateralManager");
  const collateralManager = await CollateralManager.deploy(
    await priceOracle.getAddress(),
  );
  await collateralManager.waitForDeployment();
  console.log("   ✅ CollateralManager:", await collateralManager.getAddress());

  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(
    await reputationManager.getAddress(),
    await collateralManager.getAddress(),
    deployer.address,
  );
  await lendingPool.waitForDeployment();
  console.log("   ✅ LendingPool:", await lendingPool.getAddress());

  const LendingPoolLens = await ethers.getContractFactory("LendingPoolLens");
  const lendingPoolLens = await LendingPoolLens.deploy(
    await lendingPool.getAddress(),
  );
  await lendingPoolLens.waitForDeployment();
  console.log("   ✅ LendingPoolLens:", await lendingPoolLens.getAddress());

  const CoSigningManager = await ethers.getContractFactory("CoSigningManager");
  const coSigningManager = await CoSigningManager.deploy(
    await reputationManager.getAddress(),
    await lendingPool.getAddress(),
  );
  await coSigningManager.waitForDeployment();
  console.log("   ✅ CoSigningManager:", await coSigningManager.getAddress());

  // ─────────────────────────────────────────────────────────────
  // 4. Configure contracts
  // ─────────────────────────────────────────────────────────────
  console.log("\n⚙️  Configuring Contracts...");

  // Setup price feeds
  await (
    await priceOracle.setPriceFeed(
      await weth.getAddress(),
      await ethPriceFeed.getAddress(),
      "WETH",
    )
  ).wait();

  await (
    await priceOracle.setPriceFeed(
      await usdc.getAddress(),
      await usdcPriceFeed.getAddress(),
      "USDC",
    )
  ).wait();

  await (
    await priceOracle.setPriceFeed(
      await wbtc.getAddress(),
      await btcPriceFeed.getAddress(),
      "WBTC",
    )
  ).wait();

  console.log("   ✅ Price feeds configured");

  await priceOracle.setStalePriceThreshold(86400 * 365 * 100); // set to 100 years
  console.log("   ✅ Stale price threshold set to very very long");

  // Grant roles
  const LENDING_POOL_ROLE_CM = await collateralManager.LENDING_POOL_ROLE();
  await collateralManager.grantRole(
    LENDING_POOL_ROLE_CM,
    await lendingPool.getAddress(),
  );

  const LENDING_POOL_ROLE_RM = await reputationManager.LENDING_POOL_ROLE();
  const COSIGNING_ROLE = await reputationManager.COSIGNING_ROLE();

  await reputationManager.grantRole(
    LENDING_POOL_ROLE_RM,
    await lendingPool.getAddress(),
  );

  await reputationManager.grantRole(
    COSIGNING_ROLE,
    await coSigningManager.getAddress(),
  );

  await reputationManager.grantRole(
    COSIGNING_ROLE,
    await lendingPool.getAddress(),
  );

  const DEFAULT_ADMIN_ROLE_CSM = await coSigningManager.DEFAULT_ADMIN_ROLE();
  await coSigningManager.grantRole(
    DEFAULT_ADMIN_ROLE_CSM,
    await lendingPool.getAddress(),
  );

  await lendingPool.setCoSigningManager(await coSigningManager.getAddress());
  console.log("   ✅ CoSigningManager set on LendingPool");

  const DEFAULT_ADMIN_ROLE = await coSigningManager.DEFAULT_ADMIN_ROLE();
  await coSigningManager.grantRole(
    DEFAULT_ADMIN_ROLE,
    await lendingPool.getAddress(),
  );
  console.log(
    "   ✅ DEFAULT_ADMIN_ROLE granted to LendingPool on CoSigningManager",
  );

  const COSIGNING_MANAGER_LP_ROLE = await coSigningManager.LENDING_POOL_ROLE();
  await coSigningManager.grantRole(
    COSIGNING_MANAGER_LP_ROLE,
    await lendingPool.getAddress(),
  );
  console.log(
    "   ✅ LENDING_POOL_ROLE granted to LendingPool on CoSigningManager",
  );

  const DATA_FEED_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DATA_FEED_ROLE"));
  await reputationManager.grantRole(
    DATA_FEED_ROLE,
    "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  );
  console.log("✅ DATA_FEED_ROLE granted to backend signer");

  // Add collateral tokens
  await collateralManager.addSupportedToken(
    await weth.getAddress(),
    18,
    ethers.parseEther("1000"),
    500,
  );

  await collateralManager.addSupportedToken(
    await usdc.getAddress(),
    6,
    10000000 * 10 ** 6,
    300,
  );

  await collateralManager.addSupportedToken(
    await wbtc.getAddress(),
    8,
    100 * 10 ** 8,
    500,
  );

  console.log("   ✅ Collateral tokens configured");

  // ─────────────────────────────────────────────────────────────
  // 5. Mint tokens to first 10 accounts
  // ─────────────────────────────────────────────────────────────
  console.log("\n💰 Minting Test Tokens to first 10 accounts...");

  const recipients = signers.slice(0, 10); // accounts 0 → 9

  for (let i = 0; i < recipients.length; i++) {
    const user = recipients[i];

    await weth.mint(user.address, ethers.parseEther("100"));
    await usdc.mint(user.address, 100_000 * 10 ** 6);
    await wbtc.mint(user.address, 10 * 10 ** 8);

    console.log(`   ✅ Minted tokens to account ${i}: ${user.address}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Initialize reputations
  // ─────────────────────────────────────────────────────────────
  console.log("\n👤 Initializing Reputations...");

  for (let i = 0; i < recipients.length; i++) {
    await reputationManager.initializeReputation(recipients[i].address);
  }

  console.log("   ✅ Reputations initialized");

  // ─────────────────────────────────────────────────────────────
  // 7. Test LendingPoolLens
  // ─────────────────────────────────────────────────────────────
  console.log("\n🧪 Testing LendingPoolLens...");

  try {
    const stats = await lendingPoolLens.getPlatformStats();
    console.log("   ✅ Platform Stats:");
    console.log(`      Total Loans: ${stats[0]}`);
    console.log(`      Total Offers: ${stats[1]}`);
    console.log(`      Active Lender Offers: ${stats[2]}`);
    console.log(`      Active Borrower Requests: ${stats[3]}`);
    console.log(`      Platform Fee Rate: ${stats[4]}`);
  } catch (error) {
    console.log("   ❌ LendingPoolLens test failed:", error.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Save deployment info
  // ─────────────────────────────────────────────────────────────
  const deploymentInfo = {
    network: "localhost",
    chainId: "31337",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      reputationManager: await reputationManager.getAddress(),
      priceOracle: await priceOracle.getAddress(),
      collateralManager: await collateralManager.getAddress(),
      lendingPool: await lendingPool.getAddress(),
      lendingPoolLens: await lendingPoolLens.getAddress(),
      coSigningManager: await coSigningManager.getAddress(),
    },
    tokens: {
      WETH: await weth.getAddress(),
      USDC: await usdc.getAddress(),
      WBTC: await wbtc.getAddress(),
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `localhost-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2),
  );

  console.log(`\n💾 Deployment info saved to deployments/${filename}`);

  // ─────────────────────────────────────────────────────────────
  // 9. Print frontend env vars
  // ─────────────────────────────────────────────────────────────
  console.log("\n📝 Update your frontend/.env with:\n");
  console.log(
    `VITE_REPUTATION_MANAGER=${await reputationManager.getAddress()}`,
  );
  console.log(`VITE_PRICE_ORACLE=${await priceOracle.getAddress()}`);
  console.log(
    `VITE_COLLATERAL_MANAGER=${await collateralManager.getAddress()}`,
  );
  console.log(`VITE_LENDING_POOL=${await lendingPool.getAddress()}`);
  console.log(`VITE_LENDING_POOL_LENS=${await lendingPoolLens.getAddress()}`);
  console.log(`VITE_COSIGNING_MANAGER=${await coSigningManager.getAddress()}`);
  console.log("\n" + "=".repeat(70) + "\n");

  console.log("✅ LOCAL DEPLOYMENT COMPLETE!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
