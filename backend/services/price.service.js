const blockchainService = require("./blockchain.service");

class PriceService {
  async getTokenPrice(tokenAddress) {
    const contract = blockchainService.getContract("priceOracle");
    const priceData = await contract.getPriceData(tokenAddress);

    return {
      tokenAddress,
      price: blockchainService.formatEther(priceData.price),
      timestamp: new Date(Number(priceData.timestamp) * 1000).toISOString(),
      roundId: priceData.roundId.toString(),
      isValid: priceData.isValid,
    };
  }

  async getAllPrices() {
    const contract = blockchainService.getContract("priceOracle");
    const tokens = await contract.getSupportedTokens();

    const prices = await Promise.all(
      tokens.map(async (tokenAddress) => {
        try {
          const priceData = await contract.getPriceData(tokenAddress);
          const description =
            await contract.getPriceFeedDescription(tokenAddress);

          return {
            tokenAddress,
            description,
            price: blockchainService.formatEther(priceData.price),
            timestamp: new Date(
              Number(priceData.timestamp) * 1000
            ).toISOString(),
            isValid: priceData.isValid,
          };
        } catch (error) {
          return {
            tokenAddress,
            error: error.message,
          };
        }
      })
    );

    return prices;
  }
}

module.exports = new PriceService();
