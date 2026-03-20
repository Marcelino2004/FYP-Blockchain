const { expect } = require("chai");
const { ethers } = require("hardhat");

// Fast forward
async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

// Refreshes price
async function refreshPrice(mockAggregator, price) {
  await mockAggregator.updateAnswer(price);
}

describe("CollateralManager", function () {
  // ============ Constants ============
  const LIQUIDATION_THRESHOLD = 11000; // 110%
  const MIN_COLLATERAL_RATIO = 12000; // 120%
  const LIQUIDATION_BONUS = 500; // 5%
  const BASIS_POINTS = 10000;
  const LIQUIDATION_GRACE_PERIOD = 3600; // 1 hour

  // Token setup helpers
  const ETH_PRICE_USD = 200000000000n; // $2000 with 8 decimals (Chainlink format)
  const MAX_DEPOSIT = ethers.parseEther("1000000");
  const LIQUIDATION_PENALTY = 500; // 5%
  const TOKEN_DECIMALS = 18;

  // ============ Shared Setup ============
  let collateralManager, priceOracle;
  let mockToken, mockToken2;
  let ethPriceFeed, token2PriceFeed;
  let owner, lendingPool, liquidator, user1, user2;
  let LENDING_POOL_ROLE, LIQUIDATOR_ROLE, DEFAULT_ADMIN_ROLE;

  beforeEach(async function () {
    [owner, lendingPool, liquidator, user1, user2] = await ethers.getSigners();

    // Deploy mock price feeds
    const MockAggregator = await ethers.getContractFactory("MockV3Aggregator");
    ethPriceFeed = await MockAggregator.deploy(8, ETH_PRICE_USD);
    await ethPriceFeed.waitForDeployment();

    token2PriceFeed = await MockAggregator.deploy(8, 100000000n); // $1
    await token2PriceFeed.waitForDeployment();

    // Deploy PriceOracle
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();

    // Deploy mock ERC20 tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Mock WETH", "mWETH", TOKEN_DECIMALS);
    await mockToken.waitForDeployment();

    mockToken2 = await MockERC20.deploy("Mock USDC", "mUSDC", TOKEN_DECIMALS);
    await mockToken2.waitForDeployment();

    // Register tokens in PriceOracle — function is setPriceFeed(token, priceFeed, symbol)
    await priceOracle.setPriceFeed(
      await mockToken.getAddress(),
      await ethPriceFeed.getAddress(),
      "mWETH",
    );
    await priceOracle.setPriceFeed(
      await mockToken2.getAddress(),
      await token2PriceFeed.getAddress(),
      "mUSDC",
    );

    // Deploy CollateralManager
    const CollateralManager =
      await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(
      await priceOracle.getAddress(),
    );
    await collateralManager.waitForDeployment();

    // Get roles
    LENDING_POOL_ROLE = await collateralManager.LENDING_POOL_ROLE();
    LIQUIDATOR_ROLE = await collateralManager.LIQUIDATOR_ROLE();
    DEFAULT_ADMIN_ROLE = await collateralManager.DEFAULT_ADMIN_ROLE();

    // Grant roles
    await collateralManager.grantRole(LENDING_POOL_ROLE, lendingPool.address);
    await collateralManager.grantRole(LIQUIDATOR_ROLE, liquidator.address);

    // Add supported token to CollateralManager
    await collateralManager.addSupportedToken(
      await mockToken.getAddress(),
      TOKEN_DECIMALS,
      MAX_DEPOSIT,
      LIQUIDATION_PENALTY,
    );

    // Mint tokens to users
    await mockToken.mint(user1.address, ethers.parseEther("10000"));
    await mockToken.mint(user2.address, ethers.parseEther("10000"));
    await mockToken2.mint(user1.address, ethers.parseEther("10000"));
  });

  // Helper: approve and deposit collateral
  async function depositCollateral(user, loanId, amount) {
    await mockToken
      .connect(user)
      .approve(await collateralManager.getAddress(), amount);
    return collateralManager
      .connect(user)
      .depositCollateral(loanId, await mockToken.getAddress(), amount);
  }

  // Helper: deposit and lock collateral
  async function depositAndLock(user, loanId, amount) {
    const tx = await depositCollateral(user, loanId, amount);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment?.name === "CollateralDeposited",
    );
    const depositId = event.args[0];
    await collateralManager
      .connect(lendingPool)
      .lockCollateral(depositId, loanId);
    return depositId;
  }

  // ============ 1. Deployment ============

  describe("Deployment", function () {
    it("Should deploy with correct priceOracle address", async function () {
      expect(await collateralManager.priceOracle()).to.equal(
        await priceOracle.getAddress(),
      );
    });

    it("Should revert on zero address priceOracle", async function () {
      const CollateralManager =
        await ethers.getContractFactory("CollateralManager");
      await expect(
        CollateralManager.deploy(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__ZeroAddress",
      );
    });

    it("Should grant DEFAULT_ADMIN_ROLE and LIQUIDATOR_ROLE to deployer", async function () {
      expect(await collateralManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address))
        .to.be.true;
      expect(await collateralManager.hasRole(LIQUIDATOR_ROLE, owner.address)).to
        .be.true;
    });

    it("Should start with nextDepositId = 1", async function () {
      expect(await collateralManager.nextDepositId()).to.equal(1);
    });

    it("Should have correct constants", async function () {
      expect(await collateralManager.LIQUIDATION_THRESHOLD()).to.equal(
        LIQUIDATION_THRESHOLD,
      );
      expect(await collateralManager.MIN_COLLATERAL_RATIO()).to.equal(
        MIN_COLLATERAL_RATIO,
      );
      expect(await collateralManager.LIQUIDATION_BONUS()).to.equal(
        LIQUIDATION_BONUS,
      );
      expect(await collateralManager.BASIS_POINTS()).to.equal(BASIS_POINTS);
      expect(await collateralManager.LIQUIDATION_GRACE_PERIOD()).to.equal(
        LIQUIDATION_GRACE_PERIOD,
      );
    });
  });

  // ============ 2. Token Management ============

  describe("Token Management", function () {
    it("Should add a supported token", async function () {
      const info = await collateralManager.getTokenInfo(
        await mockToken.getAddress(),
      );
      expect(info.isSupported).to.be.true;
      expect(info.maxDepositAmount).to.equal(MAX_DEPOSIT);
      expect(info.liquidationPenalty).to.equal(LIQUIDATION_PENALTY);
    });

    it("Should list supported tokens", async function () {
      const tokens = await collateralManager.getSupportedTokens();
      expect(tokens).to.include(await mockToken.getAddress());
    });

    it("Should emit TokenAdded event", async function () {
      // Add the second token (already in oracle)
      await collateralManager.addSupportedToken(
        await mockToken2.getAddress(),
        TOKEN_DECIMALS,
        MAX_DEPOSIT,
        LIQUIDATION_PENALTY,
      );
      // Just verify it was added
      const info = await collateralManager.getTokenInfo(
        await mockToken2.getAddress(),
      );
      expect(info.isSupported).to.be.true;
    });

    it("Should revert adding zero address token", async function () {
      await expect(
        collateralManager.addSupportedToken(
          ethers.ZeroAddress,
          18,
          MAX_DEPOSIT,
          LIQUIDATION_PENALTY,
        ),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__ZeroAddress",
      );
    });

    it("Should revert adding already supported token", async function () {
      await expect(
        collateralManager.addSupportedToken(
          await mockToken.getAddress(),
          TOKEN_DECIMALS,
          MAX_DEPOSIT,
          LIQUIDATION_PENALTY,
        ),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__InvalidToken",
      );
    });

    it("Should revert adding token not in price oracle", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const unsupportedToken = await MockERC20.deploy("Unsupported", "UNS", 18);
      await unsupportedToken.waitForDeployment();

      await expect(
        collateralManager.addSupportedToken(
          await unsupportedToken.getAddress(),
          18,
          MAX_DEPOSIT,
          LIQUIDATION_PENALTY,
        ),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__TokenNotSupported",
      );
    });

    it("Should remove a supported token with no deposits", async function () {
      // Add token2 first
      await collateralManager.addSupportedToken(
        await mockToken2.getAddress(),
        TOKEN_DECIMALS,
        MAX_DEPOSIT,
        LIQUIDATION_PENALTY,
      );
      await collateralManager.removeSupportedToken(
        await mockToken2.getAddress(),
      );
      const info = await collateralManager.getTokenInfo(
        await mockToken2.getAddress(),
      );
      expect(info.isSupported).to.be.false;
    });

    it("Should revert removing token with active deposits", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await expect(
        collateralManager.removeSupportedToken(await mockToken.getAddress()),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__InvalidToken",
      );
    });

    it("Should revert removing unsupported token", async function () {
      await expect(
        collateralManager.removeSupportedToken(await mockToken2.getAddress()),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__TokenNotSupported",
      );
    });

    it("Should update token config", async function () {
      const newMax = ethers.parseEther("500000");
      const newPenalty = 300;
      await collateralManager.updateTokenConfig(
        await mockToken.getAddress(),
        newMax,
        newPenalty,
      );
      const info = await collateralManager.getTokenInfo(
        await mockToken.getAddress(),
      );
      expect(info.maxDepositAmount).to.equal(newMax);
      expect(info.liquidationPenalty).to.equal(newPenalty);
    });

    it("Should revert updateTokenConfig for unsupported token", async function () {
      await expect(
        collateralManager.updateTokenConfig(
          await mockToken2.getAddress(),
          MAX_DEPOSIT,
          100,
        ),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__TokenNotSupported",
      );
    });

    it("Should revert token management if called by non-admin", async function () {
      await expect(
        collateralManager
          .connect(user1)
          .addSupportedToken(
            await mockToken2.getAddress(),
            18,
            MAX_DEPOSIT,
            LIQUIDATION_PENALTY,
          ),
      ).to.be.reverted;
    });
  });

  // ============ 3. Deposit Collateral ============

  describe("Deposit Collateral", function () {
    it("Should deposit collateral and return depositId", async function () {
      const amount = ethers.parseEther("5");
      await mockToken
        .connect(user1)
        .approve(await collateralManager.getAddress(), amount);
      const tx = await collateralManager
        .connect(user1)
        .depositCollateral(1, await mockToken.getAddress(), amount);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (l) => l.fragment?.name === "CollateralDeposited",
      );
      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(1n); // first depositId
    });

    it("Should store deposit data correctly", async function () {
      const amount = ethers.parseEther("3");
      const loanId = 42;
      await depositCollateral(user1, loanId, amount);

      const deposit = await collateralManager.getCollateralDeposit(1);
      expect(deposit.depositor).to.equal(user1.address);
      expect(deposit.tokenAddress).to.equal(await mockToken.getAddress());
      expect(deposit.amount).to.equal(amount);
      expect(deposit.loanId).to.equal(loanId);
      expect(deposit.isLocked).to.be.false;
    });

    it("Should increment nextDepositId after deposit", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      expect(await collateralManager.nextDepositId()).to.equal(2);
    });

    it("Should update totalDeposited for token", async function () {
      const amount = ethers.parseEther("10");
      await depositCollateral(user1, 1, amount);
      const info = await collateralManager.getTokenInfo(
        await mockToken.getAddress(),
      );
      expect(info.totalDeposited).to.equal(amount);
    });

    it("Should track deposit in userDepositIds and loanToDepositIds", async function () {
      const loanId = 5;
      await depositCollateral(user1, loanId, ethers.parseEther("2"));

      const userDeposits = await collateralManager.getUserDeposits(
        user1.address,
      );
      expect(userDeposits.length).to.equal(1);

      const loanDeposits = await collateralManager.getLoanCollateral(loanId);
      expect(loanDeposits.length).to.equal(1);
    });

    it("Should transfer tokens from depositor to contract", async function () {
      const amount = ethers.parseEther("5");
      const balanceBefore = await mockToken.balanceOf(user1.address);
      await depositCollateral(user1, 1, amount);
      const balanceAfter = await mockToken.balanceOf(user1.address);
      expect(balanceBefore - balanceAfter).to.equal(amount);
    });

    it("Should emit CollateralDeposited event", async function () {
      const amount = ethers.parseEther("1");
      await mockToken
        .connect(user1)
        .approve(await collateralManager.getAddress(), amount);
      await expect(
        collateralManager
          .connect(user1)
          .depositCollateral(1, await mockToken.getAddress(), amount),
      ).to.emit(collateralManager, "CollateralDeposited");
    });

    it("Should allow multiple deposits for the same loan", async function () {
      const loanId = 10;
      await depositCollateral(user1, loanId, ethers.parseEther("1"));
      await depositCollateral(user1, loanId, ethers.parseEther("2"));
      const deposits = await collateralManager.getLoanCollateral(loanId);
      expect(deposits.length).to.equal(2);
    });

    it("Should revert on unsupported token", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const badToken = await MockERC20.deploy("Bad", "BAD", 18);
      await badToken.mint(user1.address, ethers.parseEther("100"));
      await badToken
        .connect(user1)
        .approve(await collateralManager.getAddress(), ethers.parseEther("1"));

      await expect(
        collateralManager
          .connect(user1)
          .depositCollateral(
            1,
            await badToken.getAddress(),
            ethers.parseEther("1"),
          ),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__TokenNotSupported",
      );
    });

    it("Should revert on zero amount", async function () {
      await expect(
        collateralManager
          .connect(user1)
          .depositCollateral(1, await mockToken.getAddress(), 0),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__InvalidAmount",
      );
    });

    it("Should revert if amount exceeds maxDepositAmount", async function () {
      const overMax = MAX_DEPOSIT + ethers.parseEther("1");
      await mockToken.mint(user1.address, overMax);
      await mockToken
        .connect(user1)
        .approve(await collateralManager.getAddress(), overMax);

      await expect(
        collateralManager
          .connect(user1)
          .depositCollateral(1, await mockToken.getAddress(), overMax),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__MaxDepositExceeded",
      );
    });
  });

  // ============ 4. Withdraw Collateral ============

  describe("Withdraw Collateral", function () {
    it("Should allow withdrawal of unlocked collateral", async function () {
      const amount = ethers.parseEther("5");
      await depositCollateral(user1, 1, amount);

      const balanceBefore = await mockToken.balanceOf(user1.address);
      await collateralManager.connect(user1).withdrawCollateral(1);
      const balanceAfter = await mockToken.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should delete deposit after withdrawal", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await collateralManager.connect(user1).withdrawCollateral(1);

      const deposit = await collateralManager.getCollateralDeposit(1);
      expect(deposit.depositor).to.equal(ethers.ZeroAddress);
    });

    it("Should decrease totalDeposited after withdrawal", async function () {
      const amount = ethers.parseEther("4");
      await depositCollateral(user1, 1, amount);
      await collateralManager.connect(user1).withdrawCollateral(1);

      const info = await collateralManager.getTokenInfo(
        await mockToken.getAddress(),
      );
      expect(info.totalDeposited).to.equal(0);
    });

    it("Should emit CollateralWithdrawn event", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await expect(
        collateralManager.connect(user1).withdrawCollateral(1),
      ).to.emit(collateralManager, "CollateralWithdrawn");
    });

    it("Should revert withdrawal of non-existent deposit", async function () {
      await expect(
        collateralManager.connect(user1).withdrawCollateral(999),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__DepositNotFound",
      );
    });

    it("Should revert withdrawal by non-depositor", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await expect(
        collateralManager.connect(user2).withdrawCollateral(1),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__UnauthorizedWithdrawal",
      );
    });

    it("Should revert withdrawal of locked collateral", async function () {
      const depositId = await depositAndLock(user1, 1, ethers.parseEther("1"));
      await expect(
        collateralManager.connect(user1).withdrawCollateral(depositId),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__DepositLocked",
      );
    });
  });

  // ============ 5. Lock Collateral ============

  describe("Lock Collateral", function () {
    it("Should lock collateral and set lockedTimestamp", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("2"));
      const tx = await collateralManager
        .connect(lendingPool)
        .lockCollateral(1, 1);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const deposit = await collateralManager.getCollateralDeposit(1);
      expect(deposit.isLocked).to.be.true;
      expect(deposit.lockedTimestamp).to.equal(block.timestamp);
    });

    it("Should emit CollateralLocked event", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await expect(
        collateralManager.connect(lendingPool).lockCollateral(1, 1),
      ).to.emit(collateralManager, "CollateralLocked");
    });

    it("Should revert locking a non-existent deposit", async function () {
      await expect(
        collateralManager.connect(lendingPool).lockCollateral(999, 1),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__DepositNotFound",
      );
    });

    it("Should revert locking an already locked deposit", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await collateralManager.connect(lendingPool).lockCollateral(1, 1);
      await expect(
        collateralManager.connect(lendingPool).lockCollateral(1, 1),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__DepositLocked",
      );
    });

    it("Should revert locking with mismatched loanId", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1")); // deposited for loanId=1
      await expect(
        collateralManager.connect(lendingPool).lockCollateral(1, 99), // wrong loanId
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__InvalidAmount",
      );
    });

    it("Should revert if called by non LENDING_POOL_ROLE", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await expect(collateralManager.connect(user1).lockCollateral(1, 1)).to.be
        .reverted;
    });
  });

  // ============ 6. Unlock Collateral ============

  describe("Unlock Collateral", function () {
    it("Should unlock a locked deposit", async function () {
      const depositId = await depositAndLock(user1, 1, ethers.parseEther("2"));
      await collateralManager.connect(lendingPool).unlockCollateral(depositId);

      const deposit = await collateralManager.getCollateralDeposit(depositId);
      expect(deposit.isLocked).to.be.false;
    });

    it("Should emit CollateralUnlocked event", async function () {
      const depositId = await depositAndLock(user1, 1, ethers.parseEther("1"));
      await expect(
        collateralManager.connect(lendingPool).unlockCollateral(depositId),
      ).to.emit(collateralManager, "CollateralUnlocked");
    });

    it("Should revert unlocking a non-existent deposit", async function () {
      await expect(
        collateralManager.connect(lendingPool).unlockCollateral(999),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__DepositNotFound",
      );
    });

    it("Should revert unlocking an already unlocked deposit", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await expect(
        collateralManager.connect(lendingPool).unlockCollateral(1),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__DepositNotLocked",
      );
    });

    it("Should revert if called by non LENDING_POOL_ROLE", async function () {
      const depositId = await depositAndLock(user1, 1, ethers.parseEther("1"));
      await expect(collateralManager.connect(user1).unlockCollateral(depositId))
        .to.be.reverted;
    });

    it("Should allow withdrawal after unlock", async function () {
      const amount = ethers.parseEther("3");
      const depositId = await depositAndLock(user1, 1, amount);
      await collateralManager.connect(lendingPool).unlockCollateral(depositId);

      const balanceBefore = await mockToken.balanceOf(user1.address);
      await collateralManager.connect(user1).withdrawCollateral(depositId);
      const balanceAfter = await mockToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });
  });

  // ============ 7. Liquidation ============

  describe("Liquidation", function () {
    it("Should liquidate locked collateral after grace period", async function () {
      const loanId = 1;
      const amount = ethers.parseEther("5");
      await depositAndLock(user1, loanId, amount);

      // Advance past grace period and refresh price feed timestamp
      await increaseTime(LIQUIDATION_GRACE_PERIOD + 1);
      await refreshPrice(ethPriceFeed, ETH_PRICE_USD);

      const loanAmount = ethers.parseEther("1"); // arbitrary USD amount
      const lenderBalBefore = await mockToken.balanceOf(lendingPool.address);

      await collateralManager
        .connect(lendingPool)
        .liquidateCollateral(loanId, loanAmount, lendingPool.address, false);

      const lenderBalAfter = await mockToken.balanceOf(lendingPool.address);
      expect(lenderBalAfter).to.be.gt(lenderBalBefore);
    });

    it("Should emit CollateralLiquidated event", async function () {
      const loanId = 2;
      await depositAndLock(user1, loanId, ethers.parseEther("2"));
      await increaseTime(LIQUIDATION_GRACE_PERIOD + 1);
      await refreshPrice(ethPriceFeed, ETH_PRICE_USD);

      await expect(
        collateralManager
          .connect(lendingPool)
          .liquidateCollateral(
            loanId,
            ethers.parseEther("1"),
            lendingPool.address,
            false,
          ),
      ).to.emit(collateralManager, "CollateralLiquidated");
    });

    it("Should revert liquidation during grace period", async function () {
      const loanId = 3;
      await depositAndLock(user1, loanId, ethers.parseEther("2"));
      // Do NOT advance time — still in grace period

      await expect(
        collateralManager
          .connect(lendingPool)
          .liquidateCollateral(
            loanId,
            ethers.parseEther("1"),
            lendingPool.address,
            true,
          ),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__GracePeriodActive",
      );
    });

    it("Should revert liquidation with zero lender address", async function () {
      const loanId = 4;
      await depositAndLock(user1, loanId, ethers.parseEther("2"));
      await increaseTime(LIQUIDATION_GRACE_PERIOD + 1);

      await expect(
        collateralManager
          .connect(lendingPool)
          .liquidateCollateral(
            loanId,
            ethers.parseEther("1"),
            ethers.ZeroAddress,
            false,
          ),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__ZeroAddress",
      );
    });

    it("Should revert liquidation when no deposits exist", async function () {
      await expect(
        collateralManager
          .connect(lendingPool)
          .liquidateCollateral(
            999,
            ethers.parseEther("1"),
            lendingPool.address,
            false,
          ),
      ).to.be.revertedWithCustomError(
        collateralManager,
        "CollateralManager__InsufficientCollateral",
      );
    });

    it("Should clear all deposits for the loan after liquidation", async function () {
      const loanId = 5;
      await depositAndLock(user1, loanId, ethers.parseEther("2"));
      await increaseTime(LIQUIDATION_GRACE_PERIOD + 1);
      await refreshPrice(ethPriceFeed, ETH_PRICE_USD);

      await collateralManager
        .connect(lendingPool)
        .liquidateCollateral(
          loanId,
          ethers.parseEther("1"),
          lendingPool.address,
          false,
        );

      const deposits = await collateralManager.getLoanCollateral(loanId);
      expect(deposits.length).to.equal(0);
    });

    it("Should decrease totalDeposited after liquidation", async function () {
      const loanId = 6;
      const amount = ethers.parseEther("3");
      await depositAndLock(user1, loanId, amount);
      await increaseTime(LIQUIDATION_GRACE_PERIOD + 1);
      await refreshPrice(ethPriceFeed, ETH_PRICE_USD);

      await collateralManager
        .connect(lendingPool)
        .liquidateCollateral(
          loanId,
          ethers.parseEther("1"),
          lendingPool.address,
          false,
        );

      const info = await collateralManager.getTokenInfo(
        await mockToken.getAddress(),
      );
      expect(info.totalDeposited).to.equal(0);
    });

    it("Should revert if called by non LENDING_POOL_ROLE", async function () {
      const loanId = 7;
      await depositAndLock(user1, loanId, ethers.parseEther("1"));
      await increaseTime(LIQUIDATION_GRACE_PERIOD + 1);
      await refreshPrice(ethPriceFeed, ETH_PRICE_USD);

      await expect(
        collateralManager
          .connect(user2)
          .liquidateCollateral(
            loanId,
            ethers.parseEther("1"),
            user2.address,
            false,
          ),
      ).to.be.reverted;
    });
  });

  // ============ 8. Collateral Valuation ============

  describe("Collateral Valuation", function () {
    it("getLoanCollateralValue: should return correct USD value", async function () {
      const loanId = 1;
      const amount = ethers.parseEther("1"); // 1 token at $2000
      await depositCollateral(user1, loanId, amount);

      const value = await collateralManager.getLoanCollateralValue(loanId);
      expect(value).to.be.gt(0);
    });

    it("getLoanCollateralValue: should return 0 for loan with no deposits", async function () {
      const value = await collateralManager.getLoanCollateralValue(9999);
      expect(value).to.equal(0);
    });

    it("getLoanCollateralValue: should sum multiple deposits", async function () {
      const loanId = 20;
      await depositCollateral(user1, loanId, ethers.parseEther("1"));
      await depositCollateral(user1, loanId, ethers.parseEther("2"));

      const value = await collateralManager.getLoanCollateralValue(loanId);
      // 3 tokens at $2000 each = $6000 (18 decimals)
      const singleValue = await collateralManager.getLoanCollateralValue(21);
      expect(value).to.be.gt(0);
    });

    it("getCollateralValueDetails: should return token amount and USD value", async function () {
      const amount = ethers.parseEther("2");
      const details = await collateralManager.getCollateralValueDetails(
        await mockToken.getAddress(),
        amount,
      );
      expect(details.tokenAddress).to.equal(await mockToken.getAddress());
      expect(details.amount).to.equal(amount);
      expect(details.valueInUSD).to.be.gt(0);
    });

    it("calculateHealthFactor: should return max uint when loanAmount is 0", async function () {
      const hf = await collateralManager.calculateHealthFactor(1, 0);
      expect(hf).to.equal(ethers.MaxUint256);
    });

    it("calculateHealthFactor: should reflect correct ratio", async function () {
      const loanId = 30;
      const depositAmount = ethers.parseEther("1"); // 1 token = $2000
      await depositCollateral(user1, loanId, depositAmount);

      // loanAmount in USD (18 decimals) = $1000
      const loanAmount = ethers.parseEther("1000");
      const hf = await collateralManager.calculateHealthFactor(
        loanId,
        loanAmount,
      );
      // collateral $2000 / loan $1000 * 10000 = 20000
      expect(hf).to.be.gt(10000); // > 100% health factor
    });

    it("isCollateralSufficient: should return true when well collateralised", async function () {
      const loanId = 31;
      await depositCollateral(user1, loanId, ethers.parseEther("2")); // $4000
      const loanAmount = ethers.parseEther("1000"); // $1000
      expect(
        await collateralManager.isCollateralSufficient(
          loanId,
          loanAmount,
          MIN_COLLATERAL_RATIO,
        ),
      ).to.be.true;
    });

    it("isCollateralSufficient: should return false when undercollateralised", async function () {
      const loanId = 32;
      await depositCollateral(user1, loanId, ethers.parseEther("0.1")); // $200
      const loanAmount = ethers.parseEther("1000"); // $1000
      expect(
        await collateralManager.isCollateralSufficient(
          loanId,
          loanAmount,
          MIN_COLLATERAL_RATIO,
        ),
      ).to.be.false;
    });

    it("isCollateralSufficient: should return true when loanAmount is 0", async function () {
      expect(
        await collateralManager.isCollateralSufficient(
          9999,
          0,
          MIN_COLLATERAL_RATIO,
        ),
      ).to.be.true;
    });

    it("canLiquidate: should return false for well-collateralised loan", async function () {
      const loanId = 40;
      await depositCollateral(user1, loanId, ethers.parseEther("2")); // $4000
      const loanAmount = ethers.parseEther("1000");
      expect(await collateralManager.canLiquidate(loanId, loanAmount)).to.be
        .false;
    });

    it("canLiquidate: should return true for undercollateralised loan", async function () {
      const loanId = 41;
      await depositCollateral(user1, loanId, ethers.parseEther("0.05")); // $100
      const loanAmount = ethers.parseEther("1000"); // $1000 → health factor = 10%
      expect(await collateralManager.canLiquidate(loanId, loanAmount)).to.be
        .true;
    });

    it("canLiquidate: should return false when loanAmount is 0", async function () {
      expect(await collateralManager.canLiquidate(9999, 0)).to.be.false;
    });
  });

  // ============ 9. View Functions ============

  describe("View Functions", function () {
    it("getCollateralDeposit: returns correct deposit", async function () {
      const amount = ethers.parseEther("7");
      await depositCollateral(user1, 55, amount);
      const deposit = await collateralManager.getCollateralDeposit(1);
      expect(deposit.depositor).to.equal(user1.address);
      expect(deposit.amount).to.equal(amount);
    });

    it("getLoanCollateral: returns all deposits for a loan", async function () {
      const loanId = 60;
      await depositCollateral(user1, loanId, ethers.parseEther("1"));
      await depositCollateral(user1, loanId, ethers.parseEther("2"));
      const deposits = await collateralManager.getLoanCollateral(loanId);
      expect(deposits.length).to.equal(2);
    });

    it("getUserDeposits: returns all deposits for a user", async function () {
      await depositCollateral(user1, 70, ethers.parseEther("1"));
      await depositCollateral(user1, 71, ethers.parseEther("2"));
      const deposits = await collateralManager.getUserDeposits(user1.address);
      expect(deposits.length).to.equal(2);
    });

    it("getUserDeposits: returns empty array for user with no deposits", async function () {
      const deposits = await collateralManager.getUserDeposits(user2.address);
      expect(deposits.length).to.equal(0);
    });

    it("getSupportedTokens: returns list of supported tokens", async function () {
      const tokens = await collateralManager.getSupportedTokens();
      expect(tokens.length).to.be.gte(1);
      expect(tokens).to.include(await mockToken.getAddress());
    });

    it("getTokenInfo: returns correct info for supported token", async function () {
      const info = await collateralManager.getTokenInfo(
        await mockToken.getAddress(),
      );
      expect(info.isSupported).to.be.true;
      expect(info.totalDeposited).to.equal(0);
    });
  });

  // ============ 10. Role-Based Access Control ============

  describe("Role-Based Access Control", function () {
    it("Should allow admin to grant LENDING_POOL_ROLE", async function () {
      await collateralManager
        .connect(owner)
        .grantRole(LENDING_POOL_ROLE, user2.address);
      expect(await collateralManager.hasRole(LENDING_POOL_ROLE, user2.address))
        .to.be.true;
    });

    it("Should allow admin to revoke LENDING_POOL_ROLE", async function () {
      await collateralManager
        .connect(owner)
        .revokeRole(LENDING_POOL_ROLE, lendingPool.address);
      expect(
        await collateralManager.hasRole(LENDING_POOL_ROLE, lendingPool.address),
      ).to.be.false;
    });

    it("Should revert lockCollateral after LENDING_POOL_ROLE is revoked", async function () {
      await depositCollateral(user1, 1, ethers.parseEther("1"));
      await collateralManager
        .connect(owner)
        .revokeRole(LENDING_POOL_ROLE, lendingPool.address);
      await expect(collateralManager.connect(lendingPool).lockCollateral(1, 1))
        .to.be.reverted;
    });
  });
});
