const blockchainService = require("./blockchain.service");

class ReputationService {
  async getReputationScore(address) {
    const contract = blockchainService.getContract("reputationManager");
    const score = await contract.getReputationScore(address);
    return score.toString();
  }

  async getReputationData(address) {
    const contract = blockchainService.getContract("reputationManager");
    const data = await contract.getReputationData(address);

    return {
      baseScore: data.baseScore.toString(),
      totalTransactions: data.totalTransactions.toString(),
      uniqueCounterparties: data.uniqueCounterparties.toString(),
      totalValueTransferred: blockchainService.formatEther(
        data.totalValueTransferred
      ),
      successfulRepayments: data.successfulRepayments.toString(),
      totalRepaymentValue: blockchainService.formatEther(
        data.totalRepaymentValue
      ),
      defaults: data.defaults.toString(),
      totalDefaultValue: blockchainService.formatEther(data.totalDefaultValue),
      walletCreationTime: new Date(
        Number(data.walletCreationTime) * 1000
      ).toISOString(),
      lastActivityTimestamp: new Date(
        Number(data.lastActivityTimestamp) * 1000
      ).toISOString(),
      emailVerified: data.emailVerified,
      phoneVerified: data.phoneVerified,
      coSigningBonus: data.coSigningBonus.toString(),
    };
  }

  async getFullReputation(address) {
    const [score, data] = await Promise.all([
      this.getReputationScore(address),
      this.getReputationData(address),
    ]);

    return { address, score, data };
  }
}

module.exports = new ReputationService();
