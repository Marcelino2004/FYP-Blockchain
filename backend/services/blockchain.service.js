const { ethers } = require("ethers");
const contractLoader = require("../config/contracts");

class BlockchainService {
  constructor() {
    this.contracts = null;
    this.provider = null;
  }

  async initialize() {
    if (!this.contracts) {
      await contractLoader.loadContracts();
      this.contracts = contractLoader.contracts;
      this.provider = contractLoader.provider;
    }
    return this.contracts;
  }

  getContract(name) {
    if (!this.contracts) {
      throw new Error("Blockchain service not initialized");
    }
    return this.contracts[name];
  }

  formatEther(value) {
    return ethers.formatEther(value);
  }

  formatUnits(value, decimals) {
    return ethers.formatUnits(value, decimals);
  }

  parseEther(value) {
    return ethers.parseEther(value.toString());
  }

  isAddress(address) {
    return ethers.isAddress(address);
  }

  async getBlockNumber() {
    return await this.provider.getBlockNumber();
  }

  async getBlock(blockNumber) {
    return await this.provider.getBlock(blockNumber);
  }
}

module.exports = new BlockchainService();
