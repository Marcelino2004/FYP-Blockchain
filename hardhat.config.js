require("@nomiclabs/hardhat-etherscan");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");
require("dotenv").config();
require("@nomicfoundation/hardhat-chai-matchers");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.7" },
      { version: "0.4.19" },
      { version: "0.8.20" },
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
      // forking: { url: MAINNET_RPC_URL, blockNumber: 17600000 },
      gasPrice: 20000000000,
      allowUnlimitedContractSize: false,
      initialBaseFeePerGas: 0,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      initialBaseFeePerGas: 0,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  gasReporter: {
    enabled: false,
    outputFile: "gas-report-txt",
    noColors: true,
    token: "MATIC",
  },
  namedAccounts: {
    deployer: {
      default: 0, // first account from the wallet
    },
    player: {
      default: 1,
    },
  },
  mocha: {
    setTimeout: 200000,
  },
};
