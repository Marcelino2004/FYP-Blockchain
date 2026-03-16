const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

class ContractLoader {
  constructor() {
    this.contracts = {};
    this.provider = null;
    this.signer = null;
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

    const files = fs
      .readdirSync(deploymentsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(deploymentsDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      throw new Error("No deployment file found!");
    }

    const latestFile = files[0].name;
    console.log(`📄 Loading deployment: ${latestFile}`);
    console.log(`   Modified: ${new Date(files[0].time).toISOString()}`);

    this.deploymentInfo = JSON.parse(
      fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8"),
    );

    return this.deploymentInfo;
  }

  /**
   * Initialize provider AND signer from VERIFIER_PRIVATE_KEY env var.
   * Falls back to read-only if no key is set (write calls will fail).
   */
  initializeProvider() {
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
    const network = process.env.NETWORK || "localhost";

    console.log(`🌐 Connecting to ${network} at ${rpcUrl}`);

    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    const privateKey = process.env.VERIFIER_PRIVATE_KEY;
    if (privateKey) {
      this.signer = new ethers.Wallet(privateKey, this.provider);
      console.log(`🔑 Backend signer loaded: ${this.signer.address}`);
    } else {
      console.warn(
        "  VERIFIER_PRIVATE_KEY not set — contracts loaded read-only.\n" +
          "   Write calls (e.g. recordOffChainVerification) will fail.\n" +
          "   Add VERIFIER_PRIVATE_KEY to your .env file.",
      );
    }

    return this.provider;
  }

  /**
   * Load all contract instances.
   * Contracts that need write access use the signer; others use the provider.
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

    const artifactsPath = path.join(
      __dirname,
      "..",
      "..",
      "artifacts",
      "contracts",
      "interfaces",
    );

    // Use signer for contracts the backend needs to write to,
    // provider for read-only contracts.
    const signerOrProvider = this.signer || this.provider;

    // ReputationManager — backend writes to this (recordOffChainVerification)
    const reputationManagerArtifact = require(
      path.join(
        artifactsPath,
        "ReputationManager.sol",
        "ReputationManager.json",
      ),
    );
    this.contracts.reputationManager = new ethers.Contract(
      addresses.reputationManager,
      reputationManagerArtifact.abi,
      signerOrProvider, // ← signer so we can call write functions
    );

    // PriceOracle — read-only
    const priceOracleArtifact = require(
      path.join(artifactsPath, "PriceOracle.sol", "PriceOracle.json"),
    );
    this.contracts.priceOracle = new ethers.Contract(
      addresses.priceOracle,
      priceOracleArtifact.abi,
      this.provider,
    );

    // CollateralManager — read-only from backend
    const collateralManagerArtifact = require(
      path.join(
        artifactsPath,
        "CollateralManager.sol",
        "CollateralManager.json",
      ),
    );
    this.contracts.collateralManager = new ethers.Contract(
      addresses.collateralManager,
      collateralManagerArtifact.abi,
      this.provider,
    );

    // LendingPool — read-only from backend
    const lendingPoolArtifact = require(
      path.join(artifactsPath, "LendingPool.sol", "LendingPool.json"),
    );
    this.contracts.lendingPool = new ethers.Contract(
      addresses.lendingPool,
      lendingPoolArtifact.abi,
      this.provider,
    );

    // LendingPoolLens — read-only
    const lendingPoolLensArtifact = require(
      path.join(artifactsPath, "LendingPoolLens.sol", "LendingPoolLens.json"),
    );
    this.contracts.lendingPoolLens = new ethers.Contract(
      addresses.lendingPoolLens,
      lendingPoolLensArtifact.abi,
      this.provider,
    );

    // CoSigningManager — read-only from backend
    const coSigningManagerArtifact = require(
      path.join(artifactsPath, "CoSigningManager.sol", "CoSigningManager.json"),
    );
    this.contracts.coSigningManager = new ethers.Contract(
      addresses.coSigningManager,
      coSigningManagerArtifact.abi,
      this.provider,
    );

    console.log("✅ Loaded contracts:", Object.keys(this.contracts));
    if (this.signer) {
      console.log(
        `✅ ReputationManager connected with signer (${this.signer.address})`,
      );
    }

    return this.contracts;
  }

  getContract(contractName) {
    if (!this.contracts[contractName]) {
      throw new Error(`Contract ${contractName} not loaded`);
    }
    return this.contracts[contractName];
  }

  getAddresses() {
    return this.deploymentInfo?.contracts || {};
  }

  getNetworkInfo() {
    return {
      network: this.deploymentInfo?.network,
      chainId: this.deploymentInfo?.chainId,
      deployer: this.deploymentInfo?.deployer,
      timestamp: this.deploymentInfo?.timestamp,
    };
  }

  /** Returns the backend signer address (useful for role checks) */
  getSignerAddress() {
    return this.signer?.address || null;
  }
}

const contractLoader = new ContractLoader();
module.exports = contractLoader;
