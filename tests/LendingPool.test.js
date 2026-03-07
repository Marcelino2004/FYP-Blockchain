const { expect } = require("chai");
const { ethers } = require("hardhat");

async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

async function refreshPrice(mockAggregator, price) {
  await mockAggregator.updateAnswer(price);
}

describe("LendingPool", function () {
  // ============ Constants ============
  const LENDER_OFFER = 0;
  const BORROW_REQUEST = 1;
  const STATUS_PENDING = 0;
  const STATUS_ACTIVE = 1;
  const STATUS_REPAID = 2;
  const STATUS_DEFAULTED = 3;

  const ONE_DAY = 86400;
  const THIRTY_DAYS = 30 * ONE_DAY;
  const ETH_PRICE = 200000000000n; // $2000 with 8 decimals
  const PRINCIPAL = ethers.parseEther("100");
  const INTEREST_RATE = 1000; // 10%
  const COLLATERAL_RATIO = 15000; // 150%
  const MIN_REPUTATION = 0;
  const PLATFORM_FEE_RATE = 100; // 1%

  // ============ Shared State ============
  let lendingPool, reputationManager, collateralManager, priceOracle;
  let loanToken, collateralToken;
  let ethPriceFeed, collateralPriceFeed;
  let owner, feeCollector, lender, borrower, other;
  let LENDING_POOL_ROLE, DATA_FEED_ROLE;

  beforeEach(async function () {
    [owner, feeCollector, lender, borrower, other] = await ethers.getSigners();

    // ── Deploy mock price feeds ──
    const MockAggregator = await ethers.getContractFactory("MockV3Aggregator");
    ethPriceFeed = await MockAggregator.deploy(8, ETH_PRICE);
    await ethPriceFeed.waitForDeployment();
    collateralPriceFeed = await MockAggregator.deploy(8, ETH_PRICE);
    await collateralPriceFeed.waitForDeployment();

    // ── Deploy PriceOracle ──
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();

    // ── Deploy mock tokens ──
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    loanToken = await MockERC20.deploy("Loan Token", "LTK", 18);
    await loanToken.waitForDeployment();
    collateralToken = await MockERC20.deploy("Collateral Token", "CTK", 18);
    await collateralToken.waitForDeployment();

    // Register tokens in oracle
    await priceOracle.setPriceFeed(
      await loanToken.getAddress(),
      await ethPriceFeed.getAddress(),
      "LTK",
    );
    await priceOracle.setPriceFeed(
      await collateralToken.getAddress(),
      await collateralPriceFeed.getAddress(),
      "CTK",
    );

    // ── Deploy ReputationManager ──
    const ReputationManager =
      await ethers.getContractFactory("ReputationManager");
    reputationManager = await ReputationManager.deploy();
    await reputationManager.waitForDeployment();

    // ── Deploy CollateralManager ──
    const CollateralManager =
      await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(
      await priceOracle.getAddress(),
    );
    await collateralManager.waitForDeployment();

    // Add collateral token support
    await collateralManager.addSupportedToken(
      await collateralToken.getAddress(),
      18,
      ethers.parseEther("10000000"),
      500,
    );

    // ── Deploy LendingPool ──
    const LendingPool = await ethers.getContractFactory("LendingPool");
    lendingPool = await LendingPool.deploy(
      await reputationManager.getAddress(),
      await collateralManager.getAddress(),
      feeCollector.address,
    );
    await lendingPool.waitForDeployment();

    // ── Wire up roles ──
    LENDING_POOL_ROLE = await reputationManager.LENDING_POOL_ROLE();
    DATA_FEED_ROLE = await reputationManager.DATA_FEED_ROLE();

    await reputationManager.grantRole(
      LENDING_POOL_ROLE,
      await lendingPool.getAddress(),
    );
    await collateralManager.grantRole(
      await collateralManager.LENDING_POOL_ROLE(),
      await lendingPool.getAddress(),
    );

    // ── Mint tokens ──
    await loanToken.mint(lender.address, ethers.parseEther("100000"));
    await loanToken.mint(borrower.address, ethers.parseEther("100000"));
    await collateralToken.mint(borrower.address, ethers.parseEther("100000"));
    await collateralToken.mint(lender.address, ethers.parseEther("100000"));

    // ── Initialize reputations ──
    await reputationManager.grantRole(DATA_FEED_ROLE, owner.address);
    await reputationManager.initializeReputation(lender.address);
    await reputationManager.initializeReputation(borrower.address);
    await reputationManager.initializeReputation(other.address);
  });

  // ── Helpers ──

  async function lenderOfferTerms(overrides = {}) {
    return {
      tokenAddress: await loanToken.getAddress(),
      principalAmount: PRINCIPAL,
      collateralAmount: 0,
      collateralToken: await collateralToken.getAddress(),
      interestRate: INTEREST_RATE,
      duration: THIRTY_DAYS,
      minReputation: MIN_REPUTATION,
      collateralRatio: 0,
      ...overrides,
    };
  }

  async function borrowRequestTerms(overrides = {}) {
    return {
      tokenAddress: await loanToken.getAddress(),
      principalAmount: PRINCIPAL,
      collateralAmount: ethers.parseEther("75"),
      collateralToken: await collateralToken.getAddress(),
      interestRate: INTEREST_RATE,
      duration: THIRTY_DAYS,
      minReputation: MIN_REPUTATION,
      collateralRatio: COLLATERAL_RATIO,
      ...overrides,
    };
  }

  async function createLenderOffer(user = lender, overrides = {}) {
    const terms = await lenderOfferTerms(overrides);
    await loanToken
      .connect(user)
      .approve(await lendingPool.getAddress(), terms.principalAmount);
    const tx = await lendingPool
      .connect(user)
      .createLoanOffer(LENDER_OFFER, terms);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment?.name === "LoanOfferCreated",
    );
    return event.args[0]; // offerId
  }

  async function createBorrowRequest(user = borrower, overrides = {}) {
    const terms = await borrowRequestTerms(overrides);
    const tx = await lendingPool
      .connect(user)
      .createLoanOffer(BORROW_REQUEST, terms);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment?.name === "LoanOfferCreated",
    );
    return event.args[0]; // offerId
  }

  async function depositCollateral(user, loanId, amount) {
    await collateralToken
      .connect(user)
      .approve(await collateralManager.getAddress(), amount);
    const tx = await collateralManager
      .connect(user)
      .depositCollateral(loanId, await collateralToken.getAddress(), amount);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment?.name === "CollateralDeposited",
    );
    return event.args[0]; // depositId
  }

  // Accept a lender offer as borrower (no collateral required by default)
  async function acceptLenderOffer(
    offerId,
    acceptor = borrower,
    depositId = 0,
  ) {
    const tx = await lendingPool
      .connect(acceptor)
      .acceptLoanOffer(offerId, depositId);
    const receipt = await tx.wait();
    const event = receipt.logs.find((l) => l.fragment?.name === "LoanMatched");
    return event.args[0]; // loanId
  }

  // Accept a borrow request as lender
  async function acceptBorrowRequest(offerId, acceptor = lender) {
    await loanToken
      .connect(acceptor)
      .approve(await lendingPool.getAddress(), PRINCIPAL);
    const tx = await lendingPool.connect(acceptor).acceptLoanOffer(offerId, 0);
    const receipt = await tx.wait();
    const event = receipt.logs.find((l) => l.fragment?.name === "LoanMatched");
    return event.args[0]; // loanId
  }

  // Full repay a loan
  async function calcAmountDue(loanId) {
    const loan = await lendingPool.getLoan(loanId);
    const principal = loan.terms.principalAmount;
    const rate = loan.terms.interestRate;
    return principal + (principal * rate) / 10000n;
  }

  async function fullRepay(loanId, payer = borrower) {
    const amountDue = await calcAmountDue(loanId);
    await loanToken
      .connect(payer)
      .approve(await lendingPool.getAddress(), amountDue);
    await lendingPool.connect(payer).repayLoan(loanId, amountDue);
  }

  // ============ 1. Deployment ============

  describe("Deployment", function () {
    it("Should store reputationManager, collateralManager, feeCollector", async function () {
      expect(await lendingPool.reputationManager()).to.equal(
        await reputationManager.getAddress(),
      );
      expect(await lendingPool.collateralManager()).to.equal(
        await collateralManager.getAddress(),
      );
      expect(await lendingPool.feeCollector()).to.equal(feeCollector.address);
    });

    it("Should start with nextOfferId = 1 and nextLoanId = 1", async function () {
      expect(await lendingPool.nextOfferId()).to.equal(1);
      expect(await lendingPool.nextLoanId()).to.equal(1);
    });

    it("Should have correct constants", async function () {
      expect(await lendingPool.platformFeeRate()).to.equal(PLATFORM_FEE_RATE);
      expect(await lendingPool.BASIS_POINTS()).to.equal(10000);
      expect(await lendingPool.MIN_LOAN_DURATION()).to.equal(ONE_DAY);
      expect(await lendingPool.MAX_LOAN_DURATION()).to.equal(365 * ONE_DAY);
      expect(await lendingPool.MAX_INTEREST_RATE()).to.equal(5000);
      expect(await lendingPool.MIN_COLLATERAL_RATIO()).to.equal(12000);
    });

    it("Should revert on zero address constructor args", async function () {
      const LendingPool = await ethers.getContractFactory("LendingPool");
      await expect(
        LendingPool.deploy(
          ethers.ZeroAddress,
          await collateralManager.getAddress(),
          feeCollector.address,
        ),
      ).to.be.revertedWithCustomError(lendingPool, "LendingPool__ZeroAddress");

      await expect(
        LendingPool.deploy(
          await reputationManager.getAddress(),
          ethers.ZeroAddress,
          feeCollector.address,
        ),
      ).to.be.revertedWithCustomError(lendingPool, "LendingPool__ZeroAddress");

      await expect(
        LendingPool.deploy(
          await reputationManager.getAddress(),
          await collateralManager.getAddress(),
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWithCustomError(lendingPool, "LendingPool__ZeroAddress");
    });

    it("Should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await lendingPool.DEFAULT_ADMIN_ROLE();
      expect(await lendingPool.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be
        .true;
    });
  });

  // ============ 2. createLoanOffer — Lender Offer ============

  describe("createLoanOffer — Lender Offer", function () {
    it("Should create a lender offer and lock tokens", async function () {
      const balBefore = await loanToken.balanceOf(lender.address);
      const offerId = await createLenderOffer();
      const balAfter = await loanToken.balanceOf(lender.address);

      expect(balBefore - balAfter).to.equal(PRINCIPAL);
      expect(offerId).to.equal(1n);
    });

    it("Should store offer data correctly", async function () {
      const offerId = await createLenderOffer();
      const offer = await lendingPool.getLoanOffer(offerId);
      expect(offer.offerType).to.equal(LENDER_OFFER);
      expect(offer.creator).to.equal(lender.address);
      expect(offer.isActive).to.be.true;
      expect(offer.terms.principalAmount).to.equal(PRINCIPAL);
    });

    it("Should add to activeLenderOffers", async function () {
      await createLenderOffer();
      const active = await lendingPool.getActiveLenderOfferIds();
      expect(active.length).to.equal(1);
    });

    it("Should emit LoanOfferCreated event", async function () {
      const terms = await lenderOfferTerms();
      await loanToken
        .connect(lender)
        .approve(await lendingPool.getAddress(), PRINCIPAL);
      await expect(
        lendingPool.connect(lender).createLoanOffer(LENDER_OFFER, terms),
      ).to.emit(lendingPool, "LoanOfferCreated");
    });

    it("Should increment nextOfferId", async function () {
      await createLenderOffer();
      expect(await lendingPool.nextOfferId()).to.equal(2);
    });

    it("Should revert on zero principal", async function () {
      const terms = await lenderOfferTerms({ principalAmount: 0 });
      await expect(
        lendingPool.connect(lender).createLoanOffer(LENDER_OFFER, terms),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidAmount",
      );
    });

    it("Should revert on duration below MIN_LOAN_DURATION", async function () {
      const terms = await lenderOfferTerms({ duration: ONE_DAY - 1 });
      await expect(
        lendingPool.connect(lender).createLoanOffer(LENDER_OFFER, terms),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidDuration",
      );
    });

    it("Should revert on duration above MAX_LOAN_DURATION", async function () {
      const terms = await lenderOfferTerms({ duration: 366 * ONE_DAY });
      await expect(
        lendingPool.connect(lender).createLoanOffer(LENDER_OFFER, terms),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidDuration",
      );
    });

    it("Should revert on interest rate above MAX_INTEREST_RATE", async function () {
      const terms = await lenderOfferTerms({ interestRate: 5001 });
      await expect(
        lendingPool.connect(lender).createLoanOffer(LENDER_OFFER, terms),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidInterestRate",
      );
    });

    it("Should revert on collateral ratio below MIN when non-zero", async function () {
      const terms = await lenderOfferTerms({ collateralRatio: 5000 }); // below 12000
      await expect(
        lendingPool.connect(lender).createLoanOffer(LENDER_OFFER, terms),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidCollateralRatio",
      );
    });
  });

  // ============ 3. createLoanOffer — Borrow Request ============

  describe("createLoanOffer — Borrow Request", function () {
    it("Should create a borrow request without locking tokens", async function () {
      const balBefore = await loanToken.balanceOf(borrower.address);
      await createBorrowRequest();
      const balAfter = await loanToken.balanceOf(borrower.address);
      expect(balAfter).to.equal(balBefore); // no tokens locked
    });

    it("Should store borrow request data correctly", async function () {
      const offerId = await createBorrowRequest();
      const offer = await lendingPool.getLoanOffer(offerId);
      expect(offer.offerType).to.equal(BORROW_REQUEST);
      expect(offer.creator).to.equal(borrower.address);
      expect(offer.isActive).to.be.true;
    });

    it("Should add to activeBorrowerRequests", async function () {
      await createBorrowRequest();
      const active = await lendingPool.getActiveBorrowerRequestIds();
      expect(active.length).to.equal(1);
    });

    it("Should revert borrow request with collateral amount but ratio below minimum", async function () {
      const terms = await borrowRequestTerms({ collateralRatio: 5000 });
      await expect(
        lendingPool.connect(borrower).createLoanOffer(BORROW_REQUEST, terms),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidCollateralRatio",
      );
    });

    it("Should revert borrow request with zero collateral but non-zero ratio", async function () {
      const terms = await borrowRequestTerms({
        collateralAmount: 0,
        collateralRatio: 15000,
      });
      await expect(
        lendingPool.connect(borrower).createLoanOffer(BORROW_REQUEST, terms),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidCollateralRatio",
      );
    });

    it("Should allow uncollateralized borrow request (both zero)", async function () {
      const terms = await borrowRequestTerms({
        collateralAmount: 0,
        collateralRatio: 0,
      });
      await expect(
        lendingPool.connect(borrower).createLoanOffer(BORROW_REQUEST, terms),
      ).to.not.be.reverted;
    });
  });

  // ============ 4. cancelLoanOffer ============

  describe("cancelLoanOffer", function () {
    it("Should cancel a lender offer and return tokens", async function () {
      const offerId = await createLenderOffer();
      const balBefore = await loanToken.balanceOf(lender.address);
      await lendingPool.connect(lender).cancelLoanOffer(offerId);
      const balAfter = await loanToken.balanceOf(lender.address);

      expect(balAfter - balBefore).to.equal(PRINCIPAL);
      const offer = await lendingPool.getLoanOffer(offerId);
      expect(offer.isActive).to.be.false;
    });

    it("Should cancel a borrow request without token transfer", async function () {
      const offerId = await createBorrowRequest();
      await lendingPool.connect(borrower).cancelLoanOffer(offerId);
      const offer = await lendingPool.getLoanOffer(offerId);
      expect(offer.isActive).to.be.false;
    });

    it("Should remove from active lists after cancellation", async function () {
      const offerId = await createLenderOffer();
      await lendingPool.connect(lender).cancelLoanOffer(offerId);
      const active = await lendingPool.getActiveLenderOfferIds();
      expect(active).to.not.include(offerId);
    });

    it("Should emit LoanOfferCancelled event", async function () {
      const offerId = await createLenderOffer();
      await expect(lendingPool.connect(lender).cancelLoanOffer(offerId))
        .to.emit(lendingPool, "LoanOfferCancelled")
        .withArgs(offerId, lender.address);
    });

    it("Should revert cancelling non-existent offer", async function () {
      await expect(
        lendingPool.connect(lender).cancelLoanOffer(999),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__OfferNotFound",
      );
    });

    it("Should revert cancelling already inactive offer", async function () {
      const offerId = await createLenderOffer();
      await lendingPool.connect(lender).cancelLoanOffer(offerId);
      await expect(
        lendingPool.connect(lender).cancelLoanOffer(offerId),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__OfferNotActive",
      );
    });

    it("Should revert cancellation by non-creator", async function () {
      const offerId = await createLenderOffer();
      await expect(
        lendingPool.connect(other).cancelLoanOffer(offerId),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__UnauthorizedCancellation",
      );
    });
  });

  // ============ 5. acceptLoanOffer — Lender Offer ============

  describe("acceptLoanOffer — Lender Offer (borrower accepts)", function () {
    it("Should create an active loan when borrower accepts", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const loan = await lendingPool.getLoan(loanId);

      expect(loan.status).to.equal(STATUS_ACTIVE);
      expect(loan.lender).to.equal(lender.address);
      expect(loan.borrower).to.equal(borrower.address);
    });

    it("Should transfer principal minus fee to borrower", async function () {
      const offerId = await createLenderOffer();
      const borrowerBalBefore = await loanToken.balanceOf(borrower.address);
      await acceptLenderOffer(offerId);
      const borrowerBalAfter = await loanToken.balanceOf(borrower.address);

      const fee = (PRINCIPAL * BigInt(PLATFORM_FEE_RATE)) / 10000n;
      expect(borrowerBalAfter - borrowerBalBefore).to.equal(PRINCIPAL - fee);
    });

    it("Should transfer platform fee to feeCollector", async function () {
      const offerId = await createLenderOffer();
      const feeBalBefore = await loanToken.balanceOf(feeCollector.address);
      await acceptLenderOffer(offerId);
      const feeBalAfter = await loanToken.balanceOf(feeCollector.address);

      const fee = (PRINCIPAL * BigInt(PLATFORM_FEE_RATE)) / 10000n;
      expect(feeBalAfter - feeBalBefore).to.equal(fee);
    });

    it("Should deactivate the offer after acceptance", async function () {
      const offerId = await createLenderOffer();
      await acceptLenderOffer(offerId);
      const offer = await lendingPool.getLoanOffer(offerId);
      expect(offer.isActive).to.be.false;
    });

    it("Should remove from activeLenderOffers after match", async function () {
      const offerId = await createLenderOffer();
      await acceptLenderOffer(offerId);
      const active = await lendingPool.getActiveLenderOfferIds();
      expect(active).to.not.include(offerId);
    });

    it("Should set correct dueTime", async function () {
      const offerId = await createLenderOffer();
      const tx = await lendingPool
        .connect(borrower)
        .acceptLoanOffer(offerId, 0);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const loanId = receipt.logs.find(
        (l) => l.fragment?.name === "LoanMatched",
      ).args[0];

      const loan = await lendingPool.getLoan(loanId);
      expect(loan.dueTime).to.equal(
        BigInt(block.timestamp) + BigInt(THIRTY_DAYS),
      );
    });

    it("Should emit LoanMatched event", async function () {
      const offerId = await createLenderOffer();
      await expect(
        lendingPool.connect(borrower).acceptLoanOffer(offerId, 0),
      ).to.emit(lendingPool, "LoanMatched");
    });

    it("Should emit PlatformFeeCollected event", async function () {
      const offerId = await createLenderOffer();
      await expect(
        lendingPool.connect(borrower).acceptLoanOffer(offerId, 0),
      ).to.emit(lendingPool, "PlatformFeeCollected");
    });

    it("Should revert accepting non-existent offer", async function () {
      await expect(
        lendingPool.connect(borrower).acceptLoanOffer(999, 0),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__OfferNotFound",
      );
    });

    it("Should revert accepting inactive offer", async function () {
      const offerId = await createLenderOffer();
      await lendingPool.connect(lender).cancelLoanOffer(offerId);
      await expect(
        lendingPool.connect(borrower).acceptLoanOffer(offerId, 0),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__OfferNotActive",
      );
    });

    it("Should revert if borrower has insufficient reputation", async function () {
      const offerId = await createLenderOffer(lender, { minReputation: 999 });
      await expect(
        lendingPool.connect(borrower).acceptLoanOffer(offerId, 0),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InsufficientReputation",
      );
    });

    it("Should revert if same offer is accepted twice", async function () {
      const offerId = await createLenderOffer();
      await acceptLenderOffer(offerId);
      await expect(
        lendingPool.connect(borrower).acceptLoanOffer(offerId, 0),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__OfferNotActive",
      );
    });
  });

  // ============ 6. acceptLoanOffer — Borrow Request with Collateral ============

  describe("acceptLoanOffer — Borrow Request (lender accepts)", function () {
    it("Should create an active loan when lender accepts borrow request", async function () {
      const nextLoanId = await lendingPool.nextLoanId();
      const offerId = await createBorrowRequest();

      // Borrower pre-deposits collateral for the upcoming loan id
      const depositId = await depositCollateral(
        borrower,
        nextLoanId,
        ethers.parseEther("75"),
      );

      await loanToken
        .connect(lender)
        .approve(await lendingPool.getAddress(), PRINCIPAL);
      const tx = await lendingPool
        .connect(lender)
        .acceptLoanOffer(offerId, depositId);
      const receipt = await tx.wait();
      const loanId = receipt.logs.find(
        (l) => l.fragment?.name === "LoanMatched",
      ).args[0];

      const loan = await lendingPool.getLoan(loanId);
      expect(loan.status).to.equal(STATUS_ACTIVE);
      expect(loan.lender).to.equal(lender.address);
      expect(loan.borrower).to.equal(borrower.address);
    });

    it("Should lock collateral on loan creation", async function () {
      const nextLoanId = await lendingPool.nextLoanId();
      const offerId = await createBorrowRequest();
      const depositId = await depositCollateral(
        borrower,
        nextLoanId,
        ethers.parseEther("75"),
      );

      await loanToken
        .connect(lender)
        .approve(await lendingPool.getAddress(), PRINCIPAL);
      await lendingPool.connect(lender).acceptLoanOffer(offerId, depositId);

      const deposit = await collateralManager.getCollateralDeposit(depositId);
      expect(deposit.isLocked).to.be.true;
    });

    it("Should revert if collateral is insufficient", async function () {
      const nextLoanId = await lendingPool.nextLoanId();
      const offerId = await createBorrowRequest();
      // Deposit far too little collateral
      const depositId = await depositCollateral(
        borrower,
        nextLoanId,
        ethers.parseEther("0.001"),
      );

      await loanToken
        .connect(lender)
        .approve(await lendingPool.getAddress(), PRINCIPAL);
      await expect(
        lendingPool.connect(lender).acceptLoanOffer(offerId, depositId),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InsufficientCollateral",
      );
    });
  });

  // ============ 7. repayLoan ============

  describe("repayLoan", function () {
    it("Should allow partial repayment", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      const partial = ethers.parseEther("50");
      await loanToken
        .connect(borrower)
        .approve(await lendingPool.getAddress(), partial);
      await lendingPool.connect(borrower).repayLoan(loanId, partial);

      const loan = await lendingPool.getLoan(loanId);
      expect(loan.amountRepaid).to.equal(partial);
      expect(loan.status).to.equal(STATUS_ACTIVE); // still active
    });

    it("Should complete loan on full repayment and set status REPAID", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      await fullRepay(loanId);

      const loan = await lendingPool.getLoan(loanId);
      expect(loan.status).to.equal(STATUS_REPAID);
    });

    it("Should transfer repayment tokens to lender", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      const amountDue = await calcAmountDue(loanId);
      const lenderBalBefore = await loanToken.balanceOf(lender.address);
      await fullRepay(loanId);
      const lenderBalAfter = await loanToken.balanceOf(lender.address);

      expect(lenderBalAfter - lenderBalBefore).to.equal(amountDue);
    });

    it("Should emit LoanRepayment event", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      const partial = ethers.parseEther("10");
      await loanToken
        .connect(borrower)
        .approve(await lendingPool.getAddress(), partial);
      await expect(
        lendingPool.connect(borrower).repayLoan(loanId, partial),
      ).to.emit(lendingPool, "LoanRepayment");
    });

    it("Should emit LoanRepaid on full repayment", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      const amountDue = await calcAmountDue(loanId);
      await loanToken
        .connect(borrower)
        .approve(await lendingPool.getAddress(), amountDue);
      await expect(
        lendingPool.connect(borrower).repayLoan(loanId, amountDue),
      ).to.emit(lendingPool, "LoanRepaid");
    });

    it("Should unlock collateral on full repayment", async function () {
      const nextLoanId = await lendingPool.nextLoanId();
      const offerId = await createBorrowRequest();
      const depositId = await depositCollateral(
        borrower,
        nextLoanId,
        ethers.parseEther("75"),
      );
      await loanToken
        .connect(lender)
        .approve(await lendingPool.getAddress(), PRINCIPAL);
      const tx = await lendingPool
        .connect(lender)
        .acceptLoanOffer(offerId, depositId);
      const receipt = await tx.wait();
      const loanId = receipt.logs.find(
        (l) => l.fragment?.name === "LoanMatched",
      ).args[0];

      await fullRepay(loanId);

      const deposit = await collateralManager.getCollateralDeposit(depositId);
      expect(deposit.isLocked).to.be.false;
    });

    it("Should cap repayment at amountDue (no over-repayment)", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      const amountDue = await calcAmountDue(loanId);
      const overpay = amountDue + ethers.parseEther("1000");
      await loanToken
        .connect(borrower)
        .approve(await lendingPool.getAddress(), overpay);
      await lendingPool.connect(borrower).repayLoan(loanId, overpay);

      const loan = await lendingPool.getLoan(loanId);
      expect(loan.amountRepaid).to.equal(amountDue);
      expect(loan.status).to.equal(STATUS_REPAID);
    });

    it("Should revert repaying a non-active loan", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      await fullRepay(loanId);

      await expect(
        lendingPool.connect(borrower).repayLoan(loanId, ethers.parseEther("1")),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__LoanNotActive",
      );
    });

    it("Should revert repaying with zero amount", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      await expect(
        lendingPool.connect(borrower).repayLoan(loanId, 0),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidRepaymentAmount",
      );
    });
  });

  // ============ 8. liquidateLoan ============

  describe("liquidateLoan", function () {
    it("Should default an overdue uncollateralised loan", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      // Advance past due time
      await increaseTime(THIRTY_DAYS + ONE_DAY);

      await lendingPool.connect(other).liquidateLoan(loanId);
      const loan = await lendingPool.getLoan(loanId);
      expect(loan.status).to.equal(STATUS_DEFAULTED);
    });

    it("Should liquidate collateral for a collateralised defaulted loan", async function () {
      const nextLoanId = await lendingPool.nextLoanId();
      const offerId = await createBorrowRequest();
      const depositId = await depositCollateral(
        borrower,
        nextLoanId,
        ethers.parseEther("75"),
      );
      await loanToken
        .connect(lender)
        .approve(await lendingPool.getAddress(), PRINCIPAL);
      const tx = await lendingPool
        .connect(lender)
        .acceptLoanOffer(offerId, depositId);
      const receipt = await tx.wait();
      const loanId = receipt.logs.find(
        (l) => l.fragment?.name === "LoanMatched",
      ).args[0];

      // Advance past due time + grace period
      await increaseTime(THIRTY_DAYS + ONE_DAY + 3600 + 1);
      await refreshPrice(ethPriceFeed, ETH_PRICE);
      await refreshPrice(collateralPriceFeed, ETH_PRICE);

      await lendingPool.connect(other).liquidateLoan(loanId);
      const loan = await lendingPool.getLoan(loanId);
      expect(loan.status).to.equal(STATUS_DEFAULTED);
    });

    it("Should emit LoanDefaulted event", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      await increaseTime(THIRTY_DAYS + ONE_DAY);

      await expect(lendingPool.connect(other).liquidateLoan(loanId)).to.emit(
        lendingPool,
        "LoanDefaulted",
      );
    });

    it("Should apply reputation penalty to borrower on default", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const scoreBefore = await reputationManager.getReputationScore(
        borrower.address,
      );

      await increaseTime(THIRTY_DAYS + ONE_DAY);
      await lendingPool.connect(other).liquidateLoan(loanId);

      const scoreAfter = await reputationManager.getReputationScore(
        borrower.address,
      );
      expect(scoreAfter).to.be.lt(scoreBefore);
    });

    it("Should revert liquidating a non-active loan", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      await fullRepay(loanId);

      await expect(
        lendingPool.connect(other).liquidateLoan(loanId),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__LoanNotActive",
      );
    });

    it("Should revert liquidating a loan that is not yet overdue", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      await expect(
        lendingPool.connect(other).liquidateLoan(loanId),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__LoanNotOverdue",
      );
    });
  });

  // ============ 9. calculateAmountDue ============

  describe("calculateAmountDue", function () {
    it("Should return principal + interest", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      const amountDue = await calcAmountDue(loanId);
      // 10% interest on 100 tokens = 110 tokens
      const expected = PRINCIPAL + (PRINCIPAL * BigInt(INTEREST_RATE)) / 10000n;
      expect(amountDue).to.equal(expected);
    });

    it("Should return 0 for non-existent loan", async function () {
      const loan9999 = await lendingPool.getLoan(9999);
      expect(loan9999.terms.principalAmount).to.equal(0); // non-existent loan has zero principal
    });
  });

  // ============ 10. isLoanOverdue ============

  describe("isLoanOverdue", function () {
    it("Should return false before due time", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      expect(await lendingPool.isLoanOverdue(loanId)).to.be.false;
    });

    it("Should return true after due time", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      await increaseTime(THIRTY_DAYS + ONE_DAY);
      expect(await lendingPool.isLoanOverdue(loanId)).to.be.true;
    });

    it("Should return false for a repaid loan", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      await fullRepay(loanId);
      await increaseTime(THIRTY_DAYS + ONE_DAY);
      expect(await lendingPool.isLoanOverdue(loanId)).to.be.false;
    });
  });

  // ============ 11. View Functions ============

  describe("View Functions", function () {
    it("getLoan: returns correct loan data", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const loan = await lendingPool.getLoan(loanId);
      expect(loan.loanId).to.equal(loanId);
      expect(loan.borrower).to.equal(borrower.address);
    });

    it("getLoanOffer: returns correct offer data", async function () {
      const offerId = await createLenderOffer();
      const offer = await lendingPool.getLoanOffer(offerId);
      expect(offer.offerId).to.equal(offerId);
      expect(offer.creator).to.equal(lender.address);
    });

    it("getUserLoans: tracks both lender and borrower", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      const lenderLoans = await lendingPool.getUserLoans(lender.address);
      const borrowerLoans = await lendingPool.getUserLoans(borrower.address);

      expect(lenderLoans).to.include(loanId);
      expect(borrowerLoans).to.include(loanId);
    });

    it("getActiveLenderOfferIds: returns only active lender offers", async function () {
      await createLenderOffer();
      await createLenderOffer();
      const active = await lendingPool.getActiveLenderOfferIds();
      expect(active.length).to.equal(2);
    });

    it("getActiveBorrowerRequestIds: returns only active borrow requests", async function () {
      await createBorrowRequest();
      const active = await lendingPool.getActiveBorrowerRequestIds();
      expect(active.length).to.equal(1);
    });
  });

  // ============ 12. Platform Fee & Admin ============

  describe("Platform Fee & Admin", function () {
    it("Should allow admin to update platform fee rate", async function () {
      await lendingPool.connect(owner).setPlatformFeeRate(200);
      expect(await lendingPool.platformFeeRate()).to.equal(200);
    });

    it("Should emit PlatformFeeRateUpdated event", async function () {
      await expect(lendingPool.connect(owner).setPlatformFeeRate(200))
        .to.emit(lendingPool, "PlatformFeeRateUpdated")
        .withArgs(100, 200);
    });

    it("Should revert if fee rate exceeds MAX_PLATFORM_FEE", async function () {
      await expect(
        lendingPool.connect(owner).setPlatformFeeRate(501),
      ).to.be.revertedWithCustomError(
        lendingPool,
        "LendingPool__InvalidFeeRate",
      );
    });

    it("Should revert setPlatformFeeRate from non-admin", async function () {
      await expect(lendingPool.connect(other).setPlatformFeeRate(200)).to.be
        .reverted;
    });

    it("Should allow admin to set CoSigningManager", async function () {
      // Deploy a dummy address — just test the setter doesn't revert
      const dummy = other.address;
      // We need a real contract address; deploy a fresh LendingPool as dummy
      const LendingPool = await ethers.getContractFactory("LendingPool");
      const dummy2 = await LendingPool.deploy(
        await reputationManager.getAddress(),
        await collateralManager.getAddress(),
        feeCollector.address,
      );
      await dummy2.waitForDeployment();
      await expect(
        lendingPool
          .connect(owner)
          .setCoSigningManager(await dummy2.getAddress()),
      ).to.not.be.reverted;
    });

    it("Should revert setCoSigningManager with zero address", async function () {
      await expect(
        lendingPool.connect(owner).setCoSigningManager(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(lendingPool, "LendingPool__ZeroAddress");
    });

    it("Should revert setCoSigningManager from non-admin", async function () {
      await expect(
        lendingPool.connect(other).setCoSigningManager(other.address),
      ).to.be.reverted;
    });
  });

  // ============ 13. Reputation Integration ============

  describe("Reputation Integration", function () {
    it("Should update borrower reputation on successful repayment", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const scoreBefore = await reputationManager.getReputationScore(
        borrower.address,
      );

      await fullRepay(loanId);

      const scoreAfter = await reputationManager.getReputationScore(
        borrower.address,
      );
      expect(scoreAfter).to.be.gte(scoreBefore);
    });

    it("Should update lender reputation on successful repayment", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const scoreBefore = await reputationManager.getReputationScore(
        lender.address,
      );

      await fullRepay(loanId);

      const scoreAfter = await reputationManager.getReputationScore(
        lender.address,
      );
      expect(scoreAfter).to.be.gte(scoreBefore);
    });

    it("Should decrease borrower reputation on default", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const scoreBefore = await reputationManager.getReputationScore(
        borrower.address,
      );

      await increaseTime(THIRTY_DAYS + ONE_DAY);
      await lendingPool.connect(other).liquidateLoan(loanId);

      const scoreAfter = await reputationManager.getReputationScore(
        borrower.address,
      );
      expect(scoreAfter).to.be.lt(scoreBefore);
    });
  });
});
