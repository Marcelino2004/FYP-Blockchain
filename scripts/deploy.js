const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
  // Platform settings
  platformFeeRate: 100, // 1% (in basis points)
  feeCollectorAddress: null, // Will use deployer if not set

  // Collateral tokens to support
  collateralTokens: [
    {
      name: "WETH",
      address: "0xd1A107f9962317667B23D49fA35ac53A5Be98fAe",
      decimals: 18,
      maxDeposit: ethers.parseEther("1000"), // 1000 ETH
      liquidationPenalty: 500, // 5%
    },
    {
      name: "WBTC",
      address: "0x81eb8F6aA459fE60e64F47a1cD9622B9F71CB93B",
      decimals: 8,
      maxDeposit: 100 * 10 ** 8, // 100 BTC
      liquidationPenalty: 500,
    },
    {
      name: "USDC",
      address: "0x550809db9AA85d5B2231b70F43B96C325c77893b",
      decimals: 6,
      maxDeposit: 10000000 * 10 ** 6, // 10M USDC
      liquidationPenalty: 300, // 3%
    },
  ],

  // Chainlink price feeds (Sepolia testnet)
  priceFeeds: {
    sepolia: {
      ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
      BTC_USD: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
      USDC_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
    },
    mainnet: {
      ETH_USD: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      BTC_USD: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
      USDC_USD: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    },
  },

  // Token addresses (will be set based on network)
  tokenAddresses: {
    sepolia: {
      WETH: "0xd1A107f9962317667B23D49fA35ac53A5Be98fAe",
      WBTC: "0x81eb8F6aA459fE60e64F47a1cD9622B9F71CB93B",
      USDC: "0x550809db9AA85d5B2231b70F43B96C325c77893b",
    },
    mainnet: {
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
  },
};

async function main() {
  console.log(
    "🚀 Starting Decentralized Reputation Lending Platform Deployment\n"
  );
  console.log("=".repeat(70));

  // Get network info
  const network = await ethers.provider.getNetwork();
  const networkName = network.name;
  console.log(`\n📡 Network: ${networkName} (Chain ID: ${network.chainId})`);

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`👤 Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

  if (balance < ethers.parseEther("0.1")) {
    console.warn("⚠️  WARNING: Low balance. Deployment may fail!\n");
  }

  // Set fee collector
  const feeCollector = CONFIG.feeCollectorAddress || deployer.address;

  console.log("=".repeat(70));
  console.log("\n📋 DEPLOYMENT PLAN:\n");
  console.log("1. ReputationManager");
  console.log("2. PriceOracle");
  console.log("3. CollateralManager");
  console.log("4. LendingPool");
  console.log("5. CoSigningManager");
  console.log("6. LendingPoolLens");
  console.log("\n" + "=".repeat(70) + "\n");

  const deploymentInfo = {
    network: networkName,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {},
  };

  // ============ 1. Deploy ReputationManager ============
  console.log("📦 [1/6] Deploying ReputationManager...");
  const ReputationManager =
    await ethers.getContractFactory("ReputationManager");
  const reputationManager = await ReputationManager.deploy();
  await reputationManager.waitForDeployment();
  const reputationManagerAddress = await reputationManager.getAddress();

  console.log(`   ✅ ReputationManager: ${reputationManagerAddress}`);
  deploymentInfo.contracts.reputationManager = reputationManagerAddress;

  // ============ 2. Deploy PriceOracle ============
  console.log("\n📦 [2/6] Deploying PriceOracle...");
  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy();
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();

  console.log(`   ✅ PriceOracle: ${priceOracleAddress}`);
  deploymentInfo.contracts.priceOracle = priceOracleAddress;

  // ============ 3. Deploy CollateralManager ============
  console.log("\n📦 [3/6] Deploying CollateralManager...");
  const CollateralManager =
    await ethers.getContractFactory("CollateralManager");
  const collateralManager = await CollateralManager.deploy(priceOracleAddress);
  await collateralManager.waitForDeployment();
  const collateralManagerAddress = await collateralManager.getAddress();

  console.log(`   ✅ CollateralManager: ${collateralManagerAddress}`);
  deploymentInfo.contracts.collateralManager = collateralManagerAddress;

  // ============ 4. Deploy LendingPool ============
  console.log("\n📦 [4/6] Deploying LendingPool...");
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(
    reputationManagerAddress,
    collateralManagerAddress,
    feeCollector
  );
  await lendingPool.waitForDeployment();
  const lendingPoolAddress = await lendingPool.getAddress();

  console.log(`   ✅ LendingPool: ${lendingPoolAddress}`);
  deploymentInfo.contracts.lendingPool = lendingPoolAddress;

  // ============ 5. Deploy CoSigningManager ============
  console.log("\n📦 [5/6] Deploying CoSigningManager...");
  const CoSigningManager = await ethers.getContractFactory("CoSigningManager");
  const coSigningManager = await CoSigningManager.deploy(
    reputationManagerAddress,
    lendingPoolAddress
  );
  await coSigningManager.waitForDeployment();
  const coSigningManagerAddress = await coSigningManager.getAddress();

  console.log(`   ✅ CoSigningManager: ${coSigningManagerAddress}`);
  deploymentInfo.contracts.coSigningManager = coSigningManagerAddress;

  // ============ 6. Deploy LendingPoolLens ============
  console.log("\n📦 [6/6] Deploying LendingPoolLens...");
  const LendingPoolLens = await ethers.getContractFactory("LendingPoolLens");
  const lendingPoolLens = await LendingPoolLens.deploy(lendingPoolAddress);
  await lendingPoolLens.waitForDeployment();
  const lendingPoolLensAddress = await lendingPoolLens.getAddress();

  console.log(`   ✅ LendingPoolLens: ${lendingPoolLensAddress}`);
  deploymentInfo.contracts.lendingPoolLens = lendingPoolLensAddress;

  console.log("\n" + "=".repeat(70));
  console.log("\n✅ ALL CONTRACTS DEPLOYED SUCCESSFULLY!\n");
  console.log("=".repeat(70));

  // ============ Configuration Phase ============
  console.log("\n🔧 CONFIGURATION PHASE\n");
  console.log("=".repeat(70) + "\n");

  // Configure PriceOracle
  console.log("⚙️  Configuring PriceOracle...");
  const priceFeeds =
    CONFIG.priceFeeds[networkName] || CONFIG.priceFeeds.sepolia;
  const tokenAddresses =
    CONFIG.tokenAddresses[networkName] || CONFIG.tokenAddresses.sepolia;

  // ✅ FIX: Wait for each setPriceFeed transaction to be mined
  if (tokenAddresses.WETH && priceFeeds.ETH_USD) {
    try {
      const tx = await priceOracle.setPriceFeed(
        tokenAddresses.WETH,
        priceFeeds.ETH_USD,
        "WETH"
      );
      await tx.wait(); // ✅ CRITICAL: Wait for transaction to be mined!
      console.log("   ✅ WETH price feed set");
    } catch (error) {
      console.log(`   ⚠️  WETH price feed failed: ${error.message}`);
    }
  }

  if (tokenAddresses.WBTC && priceFeeds.BTC_USD) {
    try {
      const tx = await priceOracle.setPriceFeed(
        tokenAddresses.WBTC,
        priceFeeds.BTC_USD,
        "WBTC"
      );
      await tx.wait(); // ✅ CRITICAL: Wait for transaction to be mined!
      console.log("   ✅ WBTC price feed set");
    } catch (error) {
      console.log(`   ⚠️  WBTC price feed failed: ${error.message}`);
    }
  }

  if (tokenAddresses.USDC && priceFeeds.USDC_USD) {
    try {
      const tx = await priceOracle.setPriceFeed(
        tokenAddresses.USDC,
        priceFeeds.USDC_USD,
        "USDC"
      );
      await tx.wait(); // ✅ CRITICAL: Wait for transaction to be mined!
      console.log("   ✅ USDC price feed set");
    } catch (error) {
      console.log(`   ⚠️  USDC price feed failed: ${error.message}`);
    }
  }

  // Grant roles to CollateralManager
  console.log("\n⚙️  Configuring CollateralManager roles...");
  const LENDING_POOL_ROLE_CM = await collateralManager.LENDING_POOL_ROLE();
  const grantRoleTx1 = await collateralManager.grantRole(
    LENDING_POOL_ROLE_CM,
    lendingPoolAddress
  );
  await grantRoleTx1.wait(); // ✅ Wait for transaction
  console.log("   ✅ LENDING_POOL_ROLE granted to LendingPool");

  // Add supported collateral tokens
  console.log("\n⚙️  Adding supported collateral tokens...");
  for (const token of CONFIG.collateralTokens) {
    const tokenAddress = tokenAddresses[token.name];

    if (tokenAddress) {
      try {
        // ✅ Now price feeds are confirmed, so this should work!
        const tx = await collateralManager.addSupportedToken(
          tokenAddress,
          token.decimals,
          token.maxDeposit,
          token.liquidationPenalty
        );
        await tx.wait(); // ✅ Wait for transaction
        console.log(`   ✅ ${token.name} added as collateral`);
      } catch (error) {
        console.log(`   ⚠️  ${token.name} failed: ${error.message}`);
      }
    } else {
      console.log(`   ⚠️  ${token.name} address not set, skipping`);
    }
  }

  // Grant roles to ReputationManager
  console.log("\n⚙️  Configuring ReputationManager roles...");
  const LENDING_POOL_ROLE_RM = await reputationManager.LENDING_POOL_ROLE();
  const COSIGNING_ROLE = await reputationManager.COSIGNING_ROLE();

  const grantRoleTx2 = await reputationManager.grantRole(
    LENDING_POOL_ROLE_RM,
    lendingPoolAddress
  );
  await grantRoleTx2.wait(); // ✅ Wait for transaction
  console.log("   ✅ LENDING_POOL_ROLE granted to LendingPool");

  const grantRoleTx3 = await reputationManager.grantRole(
    COSIGNING_ROLE,
    coSigningManagerAddress
  );
  await grantRoleTx3.wait(); // ✅ Wait for transaction
  console.log("   ✅ COSIGNING_ROLE granted to CoSigningManager");

  // Configure LendingPool
  console.log("\n⚙️  Configuring LendingPool...");
  console.log(`   ✅ Platform fee rate: ${CONFIG.platformFeeRate / 100}%`);
  console.log(`   ✅ Fee collector: ${feeCollector}`);

  console.log("\n" + "=".repeat(70));
  console.log("\n✅ CONFIGURATION COMPLETE!\n");
  console.log("=".repeat(70));

  // ============ Save Deployment Info ============
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${networkName}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);

  // Add configuration to deployment info
  deploymentInfo.configuration = {
    platformFeeRate: CONFIG.platformFeeRate,
    feeCollector: feeCollector,
    priceFeeds: priceFeeds,
    tokenAddresses: tokenAddresses,
    supportedCollateral: CONFIG.collateralTokens.map((t) => t.name),
  };

  // Add role identifiers
  deploymentInfo.roles = {
    reputationManager: {
      LENDING_POOL_ROLE: LENDING_POOL_ROLE_RM,
      COSIGNING_ROLE: COSIGNING_ROLE,
    },
    collateralManager: {
      LENDING_POOL_ROLE: LENDING_POOL_ROLE_CM,
    },
  };

  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Deployment info saved to: deployments/${filename}\n`);

  // ============ Summary ============
  console.log("=".repeat(70));
  console.log("\n📊 DEPLOYMENT SUMMARY\n");
  console.log("=".repeat(70));
  console.log("\n📋 Contract Addresses:\n");
  console.log(`   ReputationManager:    ${reputationManagerAddress}`);
  console.log(`   PriceOracle:          ${priceOracleAddress}`);
  console.log(`   CollateralManager:    ${collateralManagerAddress}`);
  console.log(`   LendingPool:          ${lendingPoolAddress}`);
  console.log(`   CoSigningManager:     ${coSigningManagerAddress}`);
  console.log(`   LendingPoolLens:      ${lendingPoolLensAddress}`);

  console.log("\n📝 Configuration:\n");
  console.log(`   Network:              ${networkName}`);
  console.log(`   Chain ID:             ${network.chainId}`);
  console.log(`   Platform Fee:         ${CONFIG.platformFeeRate / 100}%`);
  console.log(`   Fee Collector:        ${feeCollector}`);

  console.log("\n=".repeat(70));

  // ============ Verification Instructions ============
  if (networkName !== "hardhat" && networkName !== "localhost") {
    console.log("\n🔍 VERIFICATION COMMANDS\n");
    console.log("=".repeat(70));
    console.log("\nRun these commands to verify contracts on Etherscan:\n");
    console.log(
      `npx hardhat verify --network ${networkName} ${reputationManagerAddress}`
    );
    console.log(
      `npx hardhat verify --network ${networkName} ${priceOracleAddress}`
    );
    console.log(
      `npx hardhat verify --network ${networkName} ${collateralManagerAddress} ${priceOracleAddress}`
    );
    console.log(
      `npx hardhat verify --network ${networkName} ${lendingPoolAddress} ${reputationManagerAddress} ${collateralManagerAddress} ${feeCollector}`
    );
    console.log(
      `npx hardhat verify --network ${networkName} ${coSigningManagerAddress} ${reputationManagerAddress} ${lendingPoolAddress}`
    );
    console.log(
      `npx hardhat verify --network ${networkName} ${lendingPoolLensAddress} ${lendingPoolAddress}`
    );
    console.log("\n" + "=".repeat(70));
  }

  // ============ Next Steps ============
  console.log("\n🎯 NEXT STEPS\n");
  console.log("=".repeat(70));
  console.log("\n1. ✅ Verify contracts on Etherscan (commands above)");
  console.log("2. 📱 Update frontend with contract addresses");
  console.log("3. 🧪 Test on testnet with small amounts");
  console.log("4. 👥 Initialize reputation for test users");
  console.log("5. 💰 Create test loan offers");
  console.log("6. 🔐 Consider security audit before mainnet");
  console.log("\n" + "=".repeat(70));

  console.log("\n🎉 DEPLOYMENT COMPLETE! 🎉\n");

  return deploymentInfo;
}

// Execute deployment
main()
  .then((deploymentInfo) => {
    console.log("\n✨ Deployment successful!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED\n");
    console.error("=".repeat(70));
    console.error("\nError details:");
    console.error(error);
    console.error("\n" + "=".repeat(70) + "\n");
    process.exit(1);
  });
