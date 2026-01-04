const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");

describe("PriceOracle", function () {
  // ============ Mock Chainlink Aggregator ============

  // We'll create a mock aggregator for testing
  async function deployMockAggregator(initialPrice, decimals = 8) {
    const MockAggregator = await ethers.getContractFactory("MockV3Aggregator");
    const mockAggregator = await MockAggregator.deploy(decimals, initialPrice);
    await mockAggregator.waitForDeployment();
    return mockAggregator;
  }

  // ============ Test Fixtures ============

  async function deployPriceOracleFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();

    // Deploy mock token contracts (just addresses for testing)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const weth = await MockERC20.deploy("Wrapped ETH", "WETH", 18);
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    const wbtc = await MockERC20.deploy("Wrapped BTC", "WBTC", 8);

    await weth.waitForDeployment();
    await usdc.waitForDeployment();
    await wbtc.waitForDeployment();

    // Deploy mock Chainlink aggregators
    // ETH/USD: $2000 with 8 decimals
    const ethPriceFeed = await deployMockAggregator(200000000000, 8);

    // USDC/USD: $1 with 8 decimals
    const usdcPriceFeed = await deployMockAggregator(100000000, 8);

    // BTC/USD: $40000 with 8 decimals
    const btcPriceFeed = await deployMockAggregator(4000000000000, 8);

    return {
      priceOracle,
      owner,
      user1,
      user2,
      weth,
      usdc,
      wbtc,
      ethPriceFeed,
      usdcPriceFeed,
      btcPriceFeed,
    };
  }

  // ============ Test Suite 1: Deployment ============

  describe("Deployment", function () {
    it("Should deploy with correct owner", async function () {
      const { priceOracle, owner } = await loadFixture(
        deployPriceOracleFixture
      );

      expect(await priceOracle.owner()).to.equal(owner.address);
    });

    it("Should have correct default stale price threshold", async function () {
      const { priceOracle } = await loadFixture(deployPriceOracleFixture);

      expect(await priceOracle.stalePriceThreshold()).to.equal(3600); // 1 hour
    });

    it("Should have correct price decimals constant", async function () {
      const { priceOracle } = await loadFixture(deployPriceOracleFixture);

      expect(await priceOracle.PRICE_DECIMALS()).to.equal(18);
    });

    it("Should start with zero supported tokens", async function () {
      const { priceOracle } = await loadFixture(deployPriceOracleFixture);

      expect(await priceOracle.getSupportedTokenCount()).to.equal(0);
    });
  });

  // ============ Test Suite 2: Setting Price Feeds ============

  describe("Setting Price Feeds", function () {
    it("Should set price feed for a token", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      expect(await priceOracle.isSupportedToken(await weth.getAddress())).to.be
        .true;
    });

    it("Should emit PriceFeedUpdated event", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      const wethAddress = await weth.getAddress();
      const feedAddress = await ethPriceFeed.getAddress();

      await expect(priceOracle.setPriceFeed(wethAddress, feedAddress, "WETH"))
        .to.emit(priceOracle, "PriceFeedUpdated")
        .withArgs(wethAddress, feedAddress, "WETH");
    });

    it("Should add token to supported tokens array", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      expect(await priceOracle.getSupportedTokenCount()).to.equal(1);

      const supportedTokens = await priceOracle.getSupportedTokens();
      expect(supportedTokens[0]).to.equal(await weth.getAddress());
    });

    it("Should allow updating existing price feed", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      const wethAddress = await weth.getAddress();

      // Set initial price feed
      await priceOracle.setPriceFeed(
        wethAddress,
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      // Deploy new mock aggregator
      const newPriceFeed = await deployMockAggregator(250000000000, 8);

      // Update price feed
      await priceOracle.setPriceFeed(
        wethAddress,
        await newPriceFeed.getAddress(),
        "WETH"
      );

      // Should still be only 1 supported token
      expect(await priceOracle.getSupportedTokenCount()).to.equal(1);
    });

    it("Should revert on zero token address", async function () {
      const { priceOracle, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      await expect(
        priceOracle.setPriceFeed(
          ethers.ZeroAddress,
          await ethPriceFeed.getAddress(),
          "WETH"
        )
      ).to.be.revertedWithCustomError(priceOracle, "PriceOracle__ZeroAddress");
    });

    it("Should revert on zero price feed address", async function () {
      const { priceOracle, weth } = await loadFixture(deployPriceOracleFixture);

      await expect(
        priceOracle.setPriceFeed(
          await weth.getAddress(),
          ethers.ZeroAddress,
          "WETH"
        )
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__InvalidPriceFeed"
      );
    });

    it("Should only allow owner to set price feeds", async function () {
      const { priceOracle, weth, ethPriceFeed, user1 } = await loadFixture(
        deployPriceOracleFixture
      );

      await expect(
        priceOracle
          .connect(user1)
          .setPriceFeed(
            await weth.getAddress(),
            await ethPriceFeed.getAddress(),
            "WETH"
          )
      ).to.be.revertedWithCustomError(
        priceOracle,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should handle multiple tokens", async function () {
      const {
        priceOracle,
        weth,
        usdc,
        wbtc,
        ethPriceFeed,
        usdcPriceFeed,
        btcPriceFeed,
      } = await loadFixture(deployPriceOracleFixture);

      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethPriceFeed.getAddress(),
        "WETH"
      );
      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcPriceFeed.getAddress(),
        "USDC"
      );
      await priceOracle.setPriceFeed(
        await wbtc.getAddress(),
        await btcPriceFeed.getAddress(),
        "WBTC"
      );

      expect(await priceOracle.getSupportedTokenCount()).to.equal(3);
    });
  });

  // ============ Test Suite 3: Removing Price Feeds ============

  describe("Removing Price Feeds", function () {
    it("Should remove price feed for a token", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      const wethAddress = await weth.getAddress();
      await priceOracle.setPriceFeed(
        wethAddress,
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      await priceOracle.removePriceFeed(wethAddress);

      expect(await priceOracle.isSupportedToken(wethAddress)).to.be.false;
    });

    it("Should emit PriceFeedRemoved event", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      const wethAddress = await weth.getAddress();
      await priceOracle.setPriceFeed(
        wethAddress,
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      await expect(priceOracle.removePriceFeed(wethAddress))
        .to.emit(priceOracle, "PriceFeedRemoved")
        .withArgs(wethAddress);
    });

    it("Should remove token from supported tokens array", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      const wethAddress = await weth.getAddress();
      await priceOracle.setPriceFeed(
        wethAddress,
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      expect(await priceOracle.getSupportedTokenCount()).to.equal(1);

      await priceOracle.removePriceFeed(wethAddress);

      expect(await priceOracle.getSupportedTokenCount()).to.equal(0);
    });

    it("Should revert when removing non-existent token", async function () {
      const { priceOracle, weth } = await loadFixture(deployPriceOracleFixture);

      await expect(
        priceOracle.removePriceFeed(await weth.getAddress())
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__TokenNotSupported"
      );
    });

    it("Should only allow owner to remove price feeds", async function () {
      const { priceOracle, weth, ethPriceFeed, user1 } = await loadFixture(
        deployPriceOracleFixture
      );

      const wethAddress = await weth.getAddress();
      await priceOracle.setPriceFeed(
        wethAddress,
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      await expect(
        priceOracle.connect(user1).removePriceFeed(wethAddress)
      ).to.be.revertedWithCustomError(
        priceOracle,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  // ============ Test Suite 4: Getting Prices ============

  describe("Getting Prices", function () {
    it("Should get correct price for ETH", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      const price = await priceOracle.getPrice(await weth.getAddress());

      // $2000 with 8 decimals = 200000000000
      // Normalized to 18 decimals = 2000 * 10^18
      expect(price).to.equal(ethers.parseEther("2000"));
    });

    it("Should get correct price for USDC", async function () {
      const { priceOracle, usdc, usdcPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcPriceFeed.getAddress(),
        "USDC"
      );

      const price = await priceOracle.getPrice(await usdc.getAddress());

      // $1 with 8 decimals = 100000000
      // Normalized to 18 decimals = 1 * 10^18
      expect(price).to.equal(ethers.parseEther("1"));
    });

    it("Should get correct price for BTC", async function () {
      const { priceOracle, wbtc, btcPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      await priceOracle.setPriceFeed(
        await wbtc.getAddress(),
        await btcPriceFeed.getAddress(),
        "WBTC"
      );

      const price = await priceOracle.getPrice(await wbtc.getAddress());

      // $40000 with 8 decimals = 4000000000000
      // Normalized to 18 decimals = 40000 * 10^18
      expect(price).to.equal(ethers.parseEther("40000"));
    });

    it("Should revert for unsupported token", async function () {
      const { priceOracle, weth } = await loadFixture(deployPriceOracleFixture);

      await expect(
        priceOracle.getPrice(await weth.getAddress())
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__TokenNotSupported"
      );
    });

    it("Should get detailed price data", async function () {
      const { priceOracle, weth, ethPriceFeed } = await loadFixture(
        deployPriceOracleFixture
      );

      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethPriceFeed.getAddress(),
        "WETH"
      );

      const priceData = await priceOracle.getPriceData(await weth.getAddress());

      expect(priceData.price).to.equal(ethers.parseEther("2000"));
      expect(priceData.isValid).to.be.true;
      expect(priceData.timestamp).to.be.gt(0);
      expect(priceData.roundId).to.be.gt(0);
    });
  });
});
