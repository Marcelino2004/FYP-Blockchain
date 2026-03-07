const { expect } = require("chai");
const { ethers } = require("hardhat");

async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

describe("PriceOracle", function () {
  // ============ Shared State ============
  let priceOracle;
  let weth, usdc, wbtc;
  let ethFeed, usdcFeed, btcFeed;
  let owner, user1;

  // Prices in 8-decimal Chainlink format
  const ETH_PRICE_RAW = 200000000000n; // $2000
  const USDC_PRICE_RAW = 100000000n; // $1
  const BTC_PRICE_RAW = 4000000000000n; // $40000

  // Expected prices normalised to 18 decimals
  const ETH_PRICE_18 = ethers.parseEther("2000");
  const USDC_PRICE_18 = ethers.parseEther("1");
  const BTC_PRICE_18 = ethers.parseEther("40000");

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    // Deploy PriceOracle
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();

    // Deploy mock tokens (addresses only — no functionality needed)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    weth = await MockERC20.deploy("Wrapped ETH", "WETH", 18);
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    wbtc = await MockERC20.deploy("Wrapped BTC", "WBTC", 8);
    await weth.waitForDeployment();
    await usdc.waitForDeployment();
    await wbtc.waitForDeployment();

    // Deploy mock Chainlink aggregators — deploy(decimals, initialAnswer)
    const MockAgg = await ethers.getContractFactory("MockV3Aggregator");
    ethFeed = await MockAgg.deploy(8, ETH_PRICE_RAW);
    usdcFeed = await MockAgg.deploy(8, USDC_PRICE_RAW);
    btcFeed = await MockAgg.deploy(8, BTC_PRICE_RAW);
    await ethFeed.waitForDeployment();
    await usdcFeed.waitForDeployment();
    await btcFeed.waitForDeployment();
  });

  // ── Helper: register WETH in the oracle ──
  async function addWeth() {
    await priceOracle.setPriceFeed(
      await weth.getAddress(),
      await ethFeed.getAddress(),
      "WETH",
    );
  }

  // ============ 1. Deployment ============

  describe("Deployment", function () {
    it("Should deploy with correct owner", async function () {
      expect(await priceOracle.owner()).to.equal(owner.address);
    });

    it("Should have default stalePriceThreshold of 1 hour", async function () {
      expect(await priceOracle.stalePriceThreshold()).to.equal(3600);
    });

    it("Should have PRICE_DECIMALS = 18", async function () {
      expect(await priceOracle.PRICE_DECIMALS()).to.equal(18);
    });

    it("Should have MAX_PRICE_DEVIATION = 5000", async function () {
      expect(await priceOracle.MAX_PRICE_DEVIATION()).to.equal(5000);
    });

    it("Should start with zero supported tokens", async function () {
      expect(await priceOracle.getSupportedTokenCount()).to.equal(0);
    });
  });

  // ============ 2. setPriceFeed ============

  describe("setPriceFeed", function () {
    it("Should register a new token and mark it as supported", async function () {
      await addWeth();
      expect(await priceOracle.isSupportedToken(await weth.getAddress())).to.be
        .true;
    });

    it("Should increment supported token count", async function () {
      await addWeth();
      expect(await priceOracle.getSupportedTokenCount()).to.equal(1);
    });

    it("Should store the price feed address", async function () {
      await addWeth();
      expect(await priceOracle.priceFeeds(await weth.getAddress())).to.equal(
        await ethFeed.getAddress(),
      );
    });

    it("Should emit PriceFeedUpdated event", async function () {
      const wethAddr = await weth.getAddress();
      const feedAddr = await ethFeed.getAddress();
      await expect(priceOracle.setPriceFeed(wethAddr, feedAddr, "WETH"))
        .to.emit(priceOracle, "PriceFeedUpdated")
        .withArgs(wethAddr, feedAddr, "WETH");
    });

    it("Should allow updating an existing feed without adding a duplicate", async function () {
      await addWeth();
      const newFeed = await (
        await ethers.getContractFactory("MockV3Aggregator")
      ).deploy(8, 250000000000n); // $2500
      await newFeed.waitForDeployment();

      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await newFeed.getAddress(),
        "WETH",
      );
      // Count must still be 1 — not 2
      expect(await priceOracle.getSupportedTokenCount()).to.equal(1);
      // Feed address updated
      expect(await priceOracle.priceFeeds(await weth.getAddress())).to.equal(
        await newFeed.getAddress(),
      );
    });

    it("Should support multiple tokens", async function () {
      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethFeed.getAddress(),
        "WETH",
      );
      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcFeed.getAddress(),
        "USDC",
      );
      await priceOracle.setPriceFeed(
        await wbtc.getAddress(),
        await btcFeed.getAddress(),
        "WBTC",
      );
      expect(await priceOracle.getSupportedTokenCount()).to.equal(3);
    });

    it("Should revert on zero token address", async function () {
      await expect(
        priceOracle.setPriceFeed(
          ethers.ZeroAddress,
          await ethFeed.getAddress(),
          "WETH",
        ),
      ).to.be.revertedWithCustomError(priceOracle, "PriceOracle__ZeroAddress");
    });

    it("Should revert on zero price feed address", async function () {
      await expect(
        priceOracle.setPriceFeed(
          await weth.getAddress(),
          ethers.ZeroAddress,
          "WETH",
        ),
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__InvalidPriceFeed",
      );
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        priceOracle
          .connect(user1)
          .setPriceFeed(
            await weth.getAddress(),
            await ethFeed.getAddress(),
            "WETH",
          ),
      ).to.be.reverted;
    });
  });

  // ============ 3. removePriceFeed ============

  describe("removePriceFeed", function () {
    it("Should mark token as unsupported after removal", async function () {
      await addWeth();
      await priceOracle.removePriceFeed(await weth.getAddress());
      expect(await priceOracle.isSupportedToken(await weth.getAddress())).to.be
        .false;
    });

    it("Should decrement supported token count", async function () {
      await addWeth();
      await priceOracle.removePriceFeed(await weth.getAddress());
      expect(await priceOracle.getSupportedTokenCount()).to.equal(0);
    });

    it("Should remove token from getSupportedTokens array", async function () {
      await addWeth();
      await priceOracle.removePriceFeed(await weth.getAddress());
      const tokens = await priceOracle.getSupportedTokens();
      expect(tokens).to.not.include(await weth.getAddress());
    });

    it("Should emit PriceFeedRemoved event", async function () {
      await addWeth();
      await expect(priceOracle.removePriceFeed(await weth.getAddress()))
        .to.emit(priceOracle, "PriceFeedRemoved")
        .withArgs(await weth.getAddress());
    });

    it("Should correctly remove middle token from array (swap-and-pop)", async function () {
      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethFeed.getAddress(),
        "WETH",
      );
      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcFeed.getAddress(),
        "USDC",
      );
      await priceOracle.setPriceFeed(
        await wbtc.getAddress(),
        await btcFeed.getAddress(),
        "WBTC",
      );

      // Remove the middle one
      await priceOracle.removePriceFeed(await usdc.getAddress());

      const tokens = await priceOracle.getSupportedTokens();
      expect(tokens.length).to.equal(2);
      expect(tokens).to.not.include(await usdc.getAddress());
    });

    it("Should revert when removing unsupported token", async function () {
      await expect(
        priceOracle.removePriceFeed(await weth.getAddress()),
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__TokenNotSupported",
      );
    });

    it("Should revert if called by non-owner", async function () {
      await addWeth();
      await expect(
        priceOracle.connect(user1).removePriceFeed(await weth.getAddress()),
      ).to.be.reverted;
    });
  });

  // ============ 4. getPrice / getPriceData ============

  describe("getPrice & getPriceData", function () {
    it("Should return correct 18-decimal price for ETH ($2000)", async function () {
      await addWeth();
      expect(await priceOracle.getPrice(await weth.getAddress())).to.equal(
        ETH_PRICE_18,
      );
    });

    it("Should return correct 18-decimal price for USDC ($1)", async function () {
      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcFeed.getAddress(),
        "USDC",
      );
      expect(await priceOracle.getPrice(await usdc.getAddress())).to.equal(
        USDC_PRICE_18,
      );
    });

    it("Should return correct 18-decimal price for BTC ($40000)", async function () {
      await priceOracle.setPriceFeed(
        await wbtc.getAddress(),
        await btcFeed.getAddress(),
        "WBTC",
      );
      expect(await priceOracle.getPrice(await wbtc.getAddress())).to.equal(
        BTC_PRICE_18,
      );
    });

    it("getPriceData: should return valid struct with price, timestamp, roundId", async function () {
      await addWeth();
      const data = await priceOracle.getPriceData(await weth.getAddress());
      expect(data.price).to.equal(ETH_PRICE_18);
      expect(data.isValid).to.be.true;
      expect(data.timestamp).to.be.gt(0);
      expect(data.roundId).to.be.gt(0);
    });

    it("Should normalise a feed with 6 decimals correctly", async function () {
      // Deploy a 6-decimal feed: $2000 = 2000_000000
      const MockAgg = await ethers.getContractFactory("MockV3Aggregator");
      const feed6 = await MockAgg.deploy(6, 2000_000000n);
      await feed6.waitForDeployment();
      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await feed6.getAddress(),
        "WETH6",
      );
      expect(await priceOracle.getPrice(await weth.getAddress())).to.equal(
        ETH_PRICE_18,
      );
    });

    it("Should normalise a feed with 18 decimals correctly", async function () {
      // Deploy an 18-decimal feed: $2000 = 2000 * 1e18
      const MockAgg = await ethers.getContractFactory("MockV3Aggregator");
      const feed18 = await MockAgg.deploy(18, ethers.parseEther("2000"));
      await feed18.waitForDeployment();
      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await feed18.getAddress(),
        "WETH18",
      );
      expect(await priceOracle.getPrice(await weth.getAddress())).to.equal(
        ETH_PRICE_18,
      );
    });

    it("Should revert for unsupported token", async function () {
      await expect(
        priceOracle.getPrice(await weth.getAddress()),
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__TokenNotSupported",
      );
    });

    it("Should revert with StalePrice after threshold is exceeded", async function () {
      await addWeth();
      // Advance time past 1 hour threshold
      await increaseTime(3601);
      await expect(
        priceOracle.getPrice(await weth.getAddress()),
      ).to.be.revertedWithCustomError(priceOracle, "PriceOracle__StalePrice");
    });
  });

  // ============ 5. getTokenValueInUSD ============

  describe("getTokenValueInUSD", function () {
    it("Should return correct USD value for 18-decimal token (1 ETH = $2000)", async function () {
      await addWeth();
      const value = await priceOracle.getTokenValueInUSD(
        await weth.getAddress(),
        ethers.parseEther("1"),
        18,
      );
      expect(value).to.equal(ethers.parseEther("2000"));
    });

    it("Should return correct USD value for 2 ETH ($4000)", async function () {
      await addWeth();
      const value = await priceOracle.getTokenValueInUSD(
        await weth.getAddress(),
        ethers.parseEther("2"),
        18,
      );
      expect(value).to.equal(ethers.parseEther("4000"));
    });

    it("Should handle 6-decimal token (USDC) correctly — 1 USDC = $1", async function () {
      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcFeed.getAddress(),
        "USDC",
      );
      // 1 USDC with 6 decimals = 1_000000
      const value = await priceOracle.getTokenValueInUSD(
        await usdc.getAddress(),
        1_000000n,
        6,
      );
      expect(value).to.equal(ethers.parseEther("1"));
    });

    it("Should handle 8-decimal token (WBTC) correctly — 1 WBTC = $40000", async function () {
      await priceOracle.setPriceFeed(
        await wbtc.getAddress(),
        await btcFeed.getAddress(),
        "WBTC",
      );
      // 1 WBTC with 8 decimals = 1_00000000
      const value = await priceOracle.getTokenValueInUSD(
        await wbtc.getAddress(),
        100000000n,
        8,
      );
      expect(value).to.equal(ethers.parseEther("40000"));
    });

    it("Should return 0 for zero amount", async function () {
      await addWeth();
      const value = await priceOracle.getTokenValueInUSD(
        await weth.getAddress(),
        0,
        18,
      );
      expect(value).to.equal(0);
    });
  });

  // ============ 6. getTokenAmountForUSD ============

  describe("getTokenAmountForUSD", function () {
    it("Should return correct token amount for $2000 worth of ETH (= 1 ETH)", async function () {
      await addWeth();
      const amount = await priceOracle.getTokenAmountForUSD(
        await weth.getAddress(),
        ethers.parseEther("2000"),
        18,
      );
      expect(amount).to.equal(ethers.parseEther("1"));
    });

    it("Should return correct token amount for $4000 worth of ETH (= 2 ETH)", async function () {
      await addWeth();
      const amount = await priceOracle.getTokenAmountForUSD(
        await weth.getAddress(),
        ethers.parseEther("4000"),
        18,
      );
      expect(amount).to.equal(ethers.parseEther("2"));
    });

    it("Should return correct amount for 6-decimal token — $1 worth of USDC = 1 USDC", async function () {
      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcFeed.getAddress(),
        "USDC",
      );
      const amount = await priceOracle.getTokenAmountForUSD(
        await usdc.getAddress(),
        ethers.parseEther("1"),
        6,
      );
      expect(amount).to.equal(1_000000n); // 1 USDC in 6 decimals
    });

    it("Should return correct amount for 8-decimal token — $40000 = 1 WBTC", async function () {
      await priceOracle.setPriceFeed(
        await wbtc.getAddress(),
        await btcFeed.getAddress(),
        "WBTC",
      );
      const amount = await priceOracle.getTokenAmountForUSD(
        await wbtc.getAddress(),
        ethers.parseEther("40000"),
        8,
      );
      expect(amount).to.equal(100000000n); // 1 WBTC in 8 decimals
    });
  });

  // ============ 7. isPriceStale ============

  describe("isPriceStale", function () {
    it("Should return false immediately after feed registration", async function () {
      await addWeth();
      expect(await priceOracle.isPriceStale(await weth.getAddress())).to.be
        .false;
    });

    it("Should return true for unsupported token", async function () {
      expect(await priceOracle.isPriceStale(await weth.getAddress())).to.be
        .true;
    });

    it("Should return false when within threshold", async function () {
      await addWeth();
      await increaseTime(3500); // still under 1 hour
      expect(await priceOracle.isPriceStale(await weth.getAddress())).to.be
        .false;
    });

    it("Should return true after exceeding threshold", async function () {
      await addWeth();
      await increaseTime(3601); // just over 1 hour
      expect(await priceOracle.isPriceStale(await weth.getAddress())).to.be
        .true;
    });

    it("Should return false again after refreshing price", async function () {
      await addWeth();
      await increaseTime(3601);
      // Refresh the feed timestamp
      await ethFeed.updateAnswer(ETH_PRICE_RAW);
      expect(await priceOracle.isPriceStale(await weth.getAddress())).to.be
        .false;
    });
  });

  // ============ 8. setStalePriceThreshold ============

  describe("setStalePriceThreshold", function () {
    it("Should update the threshold", async function () {
      await priceOracle.setStalePriceThreshold(7200);
      expect(await priceOracle.stalePriceThreshold()).to.equal(7200);
    });

    it("Should emit StalePriceThresholdUpdated event", async function () {
      await expect(priceOracle.setStalePriceThreshold(7200))
        .to.emit(priceOracle, "StalePriceThresholdUpdated")
        .withArgs(3600, 7200);
    });

    it("Should accept maximum valid threshold (86400 = 1 day)", async function () {
      await expect(priceOracle.setStalePriceThreshold(86400)).to.not.be
        .reverted;
    });

    it("Should revert on zero threshold", async function () {
      await expect(
        priceOracle.setStalePriceThreshold(0),
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__InvalidThreshold",
      );
    });

    it("Should revert on threshold above 1 day", async function () {
      await expect(
        priceOracle.setStalePriceThreshold(86401),
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__InvalidThreshold",
      );
    });

    it("Should revert if called by non-owner", async function () {
      await expect(priceOracle.connect(user1).setStalePriceThreshold(7200)).to
        .be.reverted;
    });

    it("A longer threshold should allow a previously-stale price to be read", async function () {
      await addWeth();
      await increaseTime(5000); // over 1 hour

      // Still stale with default threshold
      await expect(
        priceOracle.getPrice(await weth.getAddress()),
      ).to.be.revertedWithCustomError(priceOracle, "PriceOracle__StalePrice");

      // Extend to 2 hours
      await priceOracle.setStalePriceThreshold(7200);

      // Now readable again
      await expect(priceOracle.getPrice(await weth.getAddress())).to.not.be
        .reverted;
    });
  });

  // ============ 9. getPriceFeedDecimals & getPriceFeedDescription ============

  describe("getPriceFeedDecimals & getPriceFeedDescription", function () {
    it("getPriceFeedDecimals: should return 8 for an 8-decimal feed", async function () {
      await addWeth();
      expect(
        await priceOracle.getPriceFeedDecimals(await weth.getAddress()),
      ).to.equal(8);
    });

    it("getPriceFeedDecimals: should revert for unsupported token", async function () {
      await expect(
        priceOracle.getPriceFeedDecimals(await weth.getAddress()),
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__TokenNotSupported",
      );
    });

    it("getPriceFeedDescription: should return a string for supported token", async function () {
      await addWeth();
      const desc = await priceOracle.getPriceFeedDescription(
        await weth.getAddress(),
      );
      expect(typeof desc).to.equal("string");
    });

    it("getPriceFeedDescription: should revert for unsupported token", async function () {
      await expect(
        priceOracle.getPriceFeedDescription(await weth.getAddress()),
      ).to.be.revertedWithCustomError(
        priceOracle,
        "PriceOracle__TokenNotSupported",
      );
    });
  });

  // ============ 10. getSupportedTokens ============

  describe("getSupportedTokens", function () {
    it("Should return empty array initially", async function () {
      expect((await priceOracle.getSupportedTokens()).length).to.equal(0);
    });

    it("Should return all registered tokens", async function () {
      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethFeed.getAddress(),
        "WETH",
      );
      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcFeed.getAddress(),
        "USDC",
      );
      const tokens = await priceOracle.getSupportedTokens();
      expect(tokens.length).to.equal(2);
      expect(tokens).to.include(await weth.getAddress());
      expect(tokens).to.include(await usdc.getAddress());
    });

    it("Should not include removed tokens", async function () {
      await priceOracle.setPriceFeed(
        await weth.getAddress(),
        await ethFeed.getAddress(),
        "WETH",
      );
      await priceOracle.setPriceFeed(
        await usdc.getAddress(),
        await usdcFeed.getAddress(),
        "USDC",
      );
      await priceOracle.removePriceFeed(await weth.getAddress());
      const tokens = await priceOracle.getSupportedTokens();
      expect(tokens).to.not.include(await weth.getAddress());
      expect(tokens).to.include(await usdc.getAddress());
    });
  });
});
