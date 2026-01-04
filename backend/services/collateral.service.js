const blockchainService = require("./blockchain.service");

class CollateralService {
  async getSupportedTokens() {
    const contract = blockchainService.getContract("collateralManager");
    const tokens = await contract.getSupportedTokens();

    const tokenDetails = await Promise.all(
      tokens.map(async (tokenAddress) => {
        const info = await contract.getTokenInfo(tokenAddress);
        const decimals = await contract.tokenDecimals(tokenAddress);

        return {
          address: tokenAddress,
          decimals: Number(decimals),
          isSupported: info.isSupported,
          maxDepositAmount: blockchainService.formatUnits(
            info.maxDepositAmount,
            decimals
          ),
          liquidationPenalty:
            (Number(info.liquidationPenalty) / 100).toFixed(2) + "%",
          totalDeposited: blockchainService.formatUnits(
            info.totalDeposited,
            decimals
          ),
        };
      })
    );

    return tokenDetails;
  }

  async getUserCollateral(address) {
    const contract = blockchainService.getContract("collateralManager");
    const deposits = await contract.getUserDeposits(address);

    return deposits.map((deposit) => ({
      depositId: deposit.depositId.toString(),
      depositor: deposit.depositor,
      tokenAddress: deposit.tokenAddress,
      amount: deposit.amount.toString(),
      loanId: deposit.loanId.toString(),
      isLocked: deposit.isLocked,
      depositTimestamp: new Date(
        Number(deposit.depositTimestamp) * 1000
      ).toISOString(),
      lockedTimestamp:
        deposit.lockedTimestamp > 0
          ? new Date(Number(deposit.lockedTimestamp) * 1000).toISOString()
          : null,
    }));
  }

  async getLoanCollateralValue(loanId) {
    const contract = blockchainService.getContract("collateralManager");
    const collateralValue = await contract.getLoanCollateralValue(loanId);
    const deposits = await contract.getLoanCollateral(loanId);

    return {
      loanId: loanId.toString(),
      totalValueUSD: blockchainService.formatEther(collateralValue),
      deposits: deposits.map((d) => ({
        depositId: d.depositId.toString(),
        tokenAddress: d.tokenAddress,
        amount: d.amount.toString(),
        isLocked: d.isLocked,
      })),
    };
  }
}

module.exports = new CollateralService();
