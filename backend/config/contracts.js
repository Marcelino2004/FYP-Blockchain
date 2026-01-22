const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

class ContractLoader {
  constructor() {
    this.contracts = {};
    this.provider = null;
    this.deploymentInfo = null;
  }

  /**
   * Load deployment information from deployments folder
   */
  loadDeploymentInfo() {
    const deploymentsDir = path.join(__dirname, "..", "..", "deployments");

    if (!fs.existsSync(deploymentsDir)) {
      throw new Error("Deployments directory not found!");
    }

    // Get all JSON files with their modification times
    const files = fs
      .readdirSync(deploymentsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(deploymentsDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time); // Sort by modification time (newest first)

    if (files.length === 0) {
      throw new Error("No deployment file found!");
    }

    const latestFile = files[0].name;
    console.log(`📄 Loading deployment: ${latestFile}`);
    console.log(`   Modified: ${new Date(files[0].time).toISOString()}`);

    this.deploymentInfo = JSON.parse(
      fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8")
    );

    return this.deploymentInfo;
  }

  /**
   * Initialize provider based on environment
   */
  initializeProvider() {
    const network = process.env.NETWORK || "localhost";
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";

    console.log(`🌐 Connecting to ${network} at ${rpcUrl}`);

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    return this.provider;
  }

  /**
   * Load all contract instances
   */
  async loadContracts() {
    if (!this.deploymentInfo) {
      this.loadDeploymentInfo();
    }

    if (!this.provider) {
      this.initializeProvider();
    }

    const { contracts: addresses } = this.deploymentInfo;

    console.log("📋 Contract addresses:", addresses);

    // Load contract artifacts
    const artifactsPath = path.join(
      __dirname,
      "..",
      "..",
      "artifacts",
      "contracts",
      "interfaces"
    );

    // Load ReputationManager
    const reputationManagerArtifact = require(
      path.join(
        artifactsPath,
        "ReputationManager.sol",
        "ReputationManager.json"
      )
    );
    this.contracts.reputationManager = new ethers.Contract(
      addresses.reputationManager,
      reputationManagerArtifact.abi,
      this.provider
    );

    // Load PriceOracle
    const priceOracleArtifact = require(
      path.join(artifactsPath, "PriceOracle.sol", "PriceOracle.json")
    );
    this.contracts.priceOracle = new ethers.Contract(
      addresses.priceOracle,
      priceOracleArtifact.abi,
      this.provider
    );

    // Load CollateralManager
    const collateralManagerArtifact = require(
      path.join(
        artifactsPath,
        "CollateralManager.sol",
        "CollateralManager.json"
      )
    );
    this.contracts.collateralManager = new ethers.Contract(
      addresses.collateralManager,
      collateralManagerArtifact.abi,
      this.provider
    );

    // Load LendingPool
    const lendingPoolArtifact = require(
      path.join(artifactsPath, "LendingPool.sol", "LendingPool.json")
    );
    this.contracts.lendingPool = new ethers.Contract(
      addresses.lendingPool,
      lendingPoolArtifact.abi,
      this.provider
    );

    // ✅ Load LendingPoolLens
    const lendingPoolLensArtifact = require(
      path.join(artifactsPath, "LendingPoolLens.sol", "LendingPoolLens.json")
    );
    this.contracts.lendingPoolLens = new ethers.Contract(
      addresses.lendingPoolLens,
      lendingPoolLensArtifact.abi,
      this.provider
    );

    // Load CoSigningManager
    const coSigningManagerArtifact = require(
      path.join(artifactsPath, "CoSigningManager.sol", "CoSigningManager.json")
    );
    this.contracts.coSigningManager = new ethers.Contract(
      addresses.coSigningManager,
      coSigningManagerArtifact.abi,
      this.provider
    );

    console.log("✅ Loaded contracts:", Object.keys(this.contracts));

    return this.contracts;
  }

  /**
   * Get contract instance
   */
  getContract(contractName) {
    if (!this.contracts[contractName]) {
      throw new Error(`Contract ${contractName} not loaded`);
    }
    return this.contracts[contractName];
  }

  /**
   * Get all contract addresses
   */
  getAddresses() {
    return this.deploymentInfo?.contracts || {};
  }

  /**
   * Get network info
   */
  getNetworkInfo() {
    return {
      network: this.deploymentInfo?.network,
      chainId: this.deploymentInfo?.chainId,
      deployer: this.deploymentInfo?.deployer,
      timestamp: this.deploymentInfo?.timestamp,
    };
  }
}

// Singleton instance
const contractLoader = new ContractLoader();

module.exports = contractLoader;
