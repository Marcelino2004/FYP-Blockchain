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
        data.totalValueTransferred,
      ),
      successfulRepayments: data.successfulRepayments.toString(),
      totalRepaymentValue: blockchainService.formatEther(
        data.totalRepaymentValue,
      ),
      defaults: data.defaults.toString(),
      totalDefaultValue: blockchainService.formatEther(data.totalDefaultValue),
      walletCreationTime: new Date(
        Number(data.walletCreationTime) * 1000,
      ).toISOString(),
      lastActivityTimestamp: new Date(
        Number(data.lastActivityTimestamp) * 1000,
      ).toISOString(),
      emailVerified: data.emailVerified,
      phoneVerified: data.phoneVerified,
      reputationGainedToday: data.reputationGainedToday.toString(),
    };
  }

  async pingReputation(address) {
    const contract = blockchainService.getContract("reputationManager");
    const tx = await contract.touchReputation(address);
    await tx.wait();
  }

  async getFullReputation(address) {
    const contract = blockchainService.getContract("reputationManager");

    // Read-only — no ping here
    const [score, data, remainingDailyCap] = await Promise.all([
      this.getReputationScore(address),
      this.getReputationData(address),
      contract.getRemainingDailyCap(address),
    ]);

    return {
      address,
      score,
      data,
      remainingDailyCap: remainingDailyCap.toString(),
    };
  }
}

module.exports = new ReputationService();
