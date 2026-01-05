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

    const files = fs.readdirSync(deploymentsDir);
    const latestFile = files.sort().reverse()[0];

    if (!latestFile) {
      throw new Error("No deployment file found!");
    }

    console.log(`📄 Loading deployment: ${latestFile}`);

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

    //Load LendingPoolLens
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

    console.log("Loaded contracts:", Object.keys(this.contracts));
    console.log("✅ All contracts loaded successfully");

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
