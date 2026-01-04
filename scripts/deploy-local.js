//deploy to local hardhat network with mock tokens

const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying to Local Hardhat Network with Mocks\n");

  const [deployer, user1, user2] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1. Deploy mock tokens
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

  // 2. Deploy mock price feeds
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

  // 3. Deploy main contracts
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
    await priceOracle.getAddress()
  );
  await collateralManager.waitForDeployment();
  console.log("   ✅ CollateralManager:", await collateralManager.getAddress());

  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(
    await reputationManager.getAddress(),
    await collateralManager.getAddress(),
    deployer.address
  );
  await lendingPool.waitForDeployment();
  console.log("   ✅ LendingPool:", await lendingPool.getAddress());

  const LendingPoolLens = await ethers.getContractFactory("LendingPoolLens");
  const lens = await LendingPoolLens.deploy(await lendingPool.getAddress());
  await lens.waitForDeployment();
  console.log("   ✅ LendingPoolLens:", await lens.getAddress());

  const CoSigningManager = await ethers.getContractFactory("CoSigningManager");
  const coSigningManager = await CoSigningManager.deploy(
    await reputationManager.getAddress(),
    await lendingPool.getAddress()
  );
  await coSigningManager.waitForDeployment();
  console.log("   ✅ CoSigningManager:", await coSigningManager.getAddress());

  // 4. Configure contracts
  console.log("\n⚙️  Configuring Contracts...");

  // Setup price feeds
  await (
    await priceOracle.setPriceFeed(
      await weth.getAddress(),
      await ethPriceFeed.getAddress(),
      "WETH"
    )
  ).wait();
  await (
    await priceOracle.setPriceFeed(
      await usdc.getAddress(),
      await usdcPriceFeed.getAddress(),
      "USDC"
    )
  ).wait();
  await (
    await priceOracle.setPriceFeed(
      await wbtc.getAddress(),
      await btcPriceFeed.getAddress(),
      "WBTC"
    )
  ).wait();
  console.log("   ✅ Price feeds configured");

  // Grant roles
  const LENDING_POOL_ROLE_CM = await collateralManager.LENDING_POOL_ROLE();
  await collateralManager.grantRole(
    LENDING_POOL_ROLE_CM,
    await lendingPool.getAddress()
  );

  const LENDING_POOL_ROLE_RM = await reputationManager.LENDING_POOL_ROLE();
  const COSIGNING_ROLE = await reputationManager.COSIGNING_ROLE();
  await reputationManager.grantRole(
    LENDING_POOL_ROLE_RM,
    await lendingPool.getAddress()
  );
  await reputationManager.grantRole(
    COSIGNING_ROLE,
    await coSigningManager.getAddress()
  );
  console.log("   ✅ Roles configured");

  // Add collateral tokens
  await collateralManager.addSupportedToken(
    await weth.getAddress(),
    18,
    ethers.parseEther("1000"),
    500
  );
  await collateralManager.addSupportedToken(
    await usdc.getAddress(),
    6,
    10000000 * 10 ** 6,
    300
  );
  await collateralManager.addSupportedToken(
    await wbtc.getAddress(),
    8,
    100 * 10 ** 8,
    500
  );
  console.log("   ✅ Collateral tokens configured");

  // 5. Mint tokens to test users
  console.log("\n💰 Minting Test Tokens...");
  await weth.mint(user1.address, ethers.parseEther("100"));
  await usdc.mint(user1.address, 100000 * 10 ** 6);
  await wbtc.mint(user1.address, 10 * 10 ** 8);

  await weth.mint(user2.address, ethers.parseEther("100"));
  await usdc.mint(user2.address, 100000 * 10 ** 6);
  console.log("   ✅ Tokens minted to test users");

  // 6. Initialize reputations
  console.log("\n👤 Initializing Reputations...");
  await reputationManager.initializeReputation(user1.address);
  await reputationManager.initializeReputation(user2.address);
  console.log("   ✅ Reputations initialized");

  console.log("\n✅ LOCAL DEPLOYMENT COMPLETE!\n");
  console.log("=".repeat(70));
  console.log("\n📋 Contract Addresses:\n");
  console.log("Mock Tokens:");
  console.log(`   WETH: ${await weth.getAddress()}`);
  console.log(`   USDC: ${await usdc.getAddress()}`);
  console.log(`   WBTC: ${await wbtc.getAddress()}`);
  console.log("\nMain Contracts:");
  console.log(`   ReputationManager: ${await reputationManager.getAddress()}`);
  console.log(`   PriceOracle: ${await priceOracle.getAddress()}`);
  console.log(`   CollateralManager: ${await collateralManager.getAddress()}`);
  console.log(`   LendingPool: ${await lendingPool.getAddress()}`);
  console.log(`   CoSigningManager: ${await coSigningManager.getAddress()}`);
  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
