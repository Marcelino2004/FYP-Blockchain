const blockchainService = require("./blockchain.service");

class CoSigningService {
  async getAllOpenRequests() {
    const contract = blockchainService.getContract("coSigningManager");
    const requests = await contract.getAllOpenRequests();

    return requests.map((req) => ({
      requestId: req.requestId.toString(),
      borrower: req.borrower,
      loanOfferId: req.loanOfferId.toString(),
      requestedBonus: req.requestedBonus.toString(),
      isActive: req.isActive,
      createdAt: new Date(Number(req.createdAt) * 1000).toISOString(),
      message: req.message,
    }));
  }

  async getUserCoSignings(address) {
    const contract = blockchainService.getContract("coSigningManager");
    const recordIds = await contract.getUserCoSignings(address);
    const stats = await contract.getCoSigningStats(address);

    const records = await Promise.all(
      recordIds.map(async (id) => {
        const record = await contract.getCoSigningRecord(id);
        return {
          recordId: record.recordId.toString(),
          coSigner: record.coSigner,
          borrower: record.borrower,
          loanId: record.loanId.toString(),
          reputationStaked: record.reputationStaked.toString(),
          bonusProvided: record.bonusProvided.toString(),
          coSignTimestamp: new Date(
            Number(record.coSignTimestamp) * 1000,
          ).toISOString(),
          isActive: record.isActive,
          loanCompleted: record.loanCompleted,
          borrowerDefaulted: record.borrowerDefaulted,
          wasCancelled: record.wasCancelled,
        };
      }),
    );

    return {
      address,
      records,
      stats: {
        totalCoSignings: stats[0].toString(),
        activeCoSignings: stats[1].toString(),
        successfulCoSignings: stats[2].toString(),
        defaultedCoSignings: stats[3].toString(),
      },
    };
  }
}

module.exports = new CoSigningService();
