const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingPoolLens", function () {
  const PRINCIPAL = ethers.parseEther("100");
  const INTEREST_RATE = 1000; // 10%
  const ONE_DAY = 86400;
  const THIRTY_DAYS = 30 * ONE_DAY;
  const ETH_PRICE = 200000000000n;

  let lens, lendingPool, reputationManager, collateralManager;
  let loanToken, collateralToken;
  let owner, feeCollector, lender, borrower;

  beforeEach(async function () {
    [owner, feeCollector, lender, borrower] = await ethers.getSigners();

    // ── Price infrastructure ──
    const MockAgg = await ethers.getContractFactory("MockV3Aggregator");
    const ethFeed = await MockAgg.deploy(8, ETH_PRICE);
    await ethFeed.waitForDeployment();

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    loanToken = await MockERC20.deploy("Loan Token", "LTK", 18);
    await loanToken.waitForDeployment();
    await priceOracle.setPriceFeed(
      await loanToken.getAddress(),
      await ethFeed.getAddress(),
      "LTK",
    );

    // ── Core contracts ──
    const ReputationManager =
      await ethers.getContractFactory("ReputationManager");
    reputationManager = await ReputationManager.deploy();
    await reputationManager.waitForDeployment();

    const CollateralManager =
      await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(
      await priceOracle.getAddress(),
    );
    await collateralManager.waitForDeployment();

    const LendingPool = await ethers.getContractFactory("LendingPool");
    lendingPool = await LendingPool.deploy(
      await reputationManager.getAddress(),
      await collateralManager.getAddress(),
      feeCollector.address,
    );
    await lendingPool.waitForDeployment();

    // ── LendingPoolLens ──
    const LendingPoolLens = await ethers.getContractFactory("LendingPoolLens");
    lens = await LendingPoolLens.deploy(await lendingPool.getAddress());
    await lens.waitForDeployment();

    // ── Roles & tokens ──
    await reputationManager.grantRole(
      await reputationManager.LENDING_POOL_ROLE(),
      await lendingPool.getAddress(),
    );
    await collateralManager.grantRole(
      await collateralManager.LENDING_POOL_ROLE(),
      await lendingPool.getAddress(),
    );
    await loanToken.mint(lender.address, ethers.parseEther("100000"));
    await loanToken.mint(borrower.address, ethers.parseEther("100000"));

    const DATA_FEED_ROLE = await reputationManager.DATA_FEED_ROLE();
    await reputationManager.grantRole(DATA_FEED_ROLE, owner.address);
    await reputationManager.initializeReputation(lender.address);
    await reputationManager.initializeReputation(borrower.address);
  });

  // ── Helpers ──

  async function createLenderOffer(user = lender) {
    const terms = {
      tokenAddress: await loanToken.getAddress(),
      principalAmount: PRINCIPAL,
      collateralAmount: 0,
      collateralToken: ethers.ZeroAddress,
      interestRate: INTEREST_RATE,
      duration: THIRTY_DAYS,
      minReputation: 0,
      collateralRatio: 0,
    };
    await loanToken
      .connect(user)
      .approve(await lendingPool.getAddress(), PRINCIPAL);
    const tx = await lendingPool.connect(user).createLoanOffer(0, terms); // 0 = LENDER_OFFER
    const receipt = await tx.wait();
    return receipt.logs.find((l) => l.fragment?.name === "LoanOfferCreated")
      .args[0];
  }

  async function createBorrowRequest(user = borrower) {
    const terms = {
      tokenAddress: await loanToken.getAddress(),
      principalAmount: PRINCIPAL,
      collateralAmount: 0,
      collateralToken: ethers.ZeroAddress,
      interestRate: INTEREST_RATE,
      duration: THIRTY_DAYS,
      minReputation: 0,
      collateralRatio: 0,
    };
    const tx = await lendingPool.connect(user).createLoanOffer(1, terms); // 1 = BORROW_REQUEST
    const receipt = await tx.wait();
    return receipt.logs.find((l) => l.fragment?.name === "LoanOfferCreated")
      .args[0];
  }

  async function acceptLenderOffer(offerId) {
    const tx = await lendingPool.connect(borrower).acceptLoanOffer(offerId, 0);
    const receipt = await tx.wait();
    return receipt.logs.find((l) => l.fragment?.name === "LoanMatched").args[0];
  }

  // ============ 1. Deployment ============

  describe("Deployment", function () {
    it("Should store the LendingPool address", async function () {
      expect(await lens.pool()).to.equal(await lendingPool.getAddress());
    });

    it("Should revert with ZERO_ADDRESS on zero pool address", async function () {
      const LendingPoolLens =
        await ethers.getContractFactory("LendingPoolLens");
      await expect(
        LendingPoolLens.deploy(ethers.ZeroAddress),
      ).to.be.revertedWith("ZERO_ADDRESS");
    });
  });

  // ============ 2. getPlatformStats ============

  describe("getPlatformStats", function () {
    it("Should return all zeros when no activity", async function () {
      const [totalLoans, totalOffers, activeLender, activeBorrower, feeRate] =
        await lens.getPlatformStats();
      expect(totalLoans).to.equal(0);
      expect(totalOffers).to.equal(0);
      expect(activeLender).to.equal(0);
      expect(activeBorrower).to.equal(0);
    });

    it("Should reflect the platform fee rate", async function () {
      const [, , , , feeRate] = await lens.getPlatformStats();
      expect(feeRate).to.equal(await lendingPool.platformFeeRate());
    });

    it("Should count totalOffers after creating an offer", async function () {
      await createLenderOffer();
      const [, totalOffers] = await lens.getPlatformStats();
      expect(totalOffers).to.equal(1);
    });

    it("Should count activeLenderOffers correctly", async function () {
      await createLenderOffer();
      await createLenderOffer();
      const [, , activeLender] = await lens.getPlatformStats();
      expect(activeLender).to.equal(2);
    });

    it("Should count activeBorrowerRequests correctly", async function () {
      await createBorrowRequest();
      const [, , , activeBorrower] = await lens.getPlatformStats();
      expect(activeBorrower).to.equal(1);
    });

    it("Should count totalLoans after a loan is matched", async function () {
      const offerId = await createLenderOffer();
      await acceptLenderOffer(offerId);
      const [totalLoans] = await lens.getPlatformStats();
      expect(totalLoans).to.equal(1);
    });

    it("Should decrease activeLenderOffers after offer is matched", async function () {
      const offerId = await createLenderOffer();
      await acceptLenderOffer(offerId);
      const [, , activeLender] = await lens.getPlatformStats();
      expect(activeLender).to.equal(0);
    });

    it("Should decrease activeLenderOffers after offer is cancelled", async function () {
      const offerId = await createLenderOffer();
      await lendingPool.connect(lender).cancelLoanOffer(offerId);
      const [, , activeLender] = await lens.getPlatformStats();
      expect(activeLender).to.equal(0);
    });
  });

  // ============ 3. getActiveLenderOffers ============

  describe("getActiveLenderOffers", function () {
    it("Should return empty array when no offers", async function () {
      expect((await lens.getActiveLenderOffers()).length).to.equal(0);
    });

    it("Should return offer IDs for active lender offers", async function () {
      const offerId = await createLenderOffer();
      const ids = await lens.getActiveLenderOffers();
      expect(ids).to.include(offerId);
    });

    it("Should not include cancelled offers", async function () {
      const offerId = await createLenderOffer();
      await lendingPool.connect(lender).cancelLoanOffer(offerId);
      const ids = await lens.getActiveLenderOffers();
      expect(ids).to.not.include(offerId);
    });

    it("Should not include matched offers", async function () {
      const offerId = await createLenderOffer();
      await acceptLenderOffer(offerId);
      const ids = await lens.getActiveLenderOffers();
      expect(ids).to.not.include(offerId);
    });

    it("Should return multiple active offers", async function () {
      await createLenderOffer();
      await createLenderOffer();
      expect((await lens.getActiveLenderOffers()).length).to.equal(2);
    });
  });

  // ============ 4. getActiveBorrowerRequests ============

  describe("getActiveBorrowerRequests", function () {
    it("Should return empty array when no requests", async function () {
      expect((await lens.getActiveBorrowerRequests()).length).to.equal(0);
    });

    it("Should return borrow request IDs", async function () {
      const offerId = await createBorrowRequest();
      const ids = await lens.getActiveBorrowerRequests();
      expect(ids).to.include(offerId);
    });

    it("Should not include cancelled borrow requests", async function () {
      const offerId = await createBorrowRequest();
      await lendingPool.connect(borrower).cancelLoanOffer(offerId);
      const ids = await lens.getActiveBorrowerRequests();
      expect(ids).to.not.include(offerId);
    });
  });

  // ============ 5. getUserLoans ============

  describe("getUserLoans", function () {
    it("Should return empty array for user with no loans", async function () {
      expect((await lens.getUserLoans(lender.address)).length).to.equal(0);
    });

    it("Should return loan IDs for lender after a match", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const ids = await lens.getUserLoans(lender.address);
      expect(ids).to.include(loanId);
    });

    it("Should return loan IDs for borrower after a match", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const ids = await lens.getUserLoans(borrower.address);
      expect(ids).to.include(loanId);
    });
  });

  // ============ 6. getUserActiveLoans ============

  describe("getUserActiveLoans", function () {
    it("Should return empty array for user with no loans", async function () {
      expect((await lens.getUserActiveLoans(lender.address)).length).to.equal(
        0,
      );
    });

    it("Should return active loan structs for a user", async function () {
      const offerId = await createLenderOffer();
      await acceptLenderOffer(offerId);
      const activeLoans = await lens.getUserActiveLoans(lender.address);
      expect(activeLoans.length).to.equal(1);
      expect(activeLoans[0].lender).to.equal(lender.address);
    });

    it("Should not include repaid loans", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);

      // Full repay
      const loan = await lendingPool.getLoan(loanId);
      const amountDue =
        loan.terms.principalAmount +
        (loan.terms.principalAmount * loan.terms.interestRate) / 10000n;
      await loanToken
        .connect(borrower)
        .approve(await lendingPool.getAddress(), amountDue);
      await lendingPool.connect(borrower).repayLoan(loanId, amountDue);

      const activeLoans = await lens.getUserActiveLoans(lender.address);
      expect(activeLoans.length).to.equal(0);
    });

    it("Should return multiple active loans for a user", async function () {
      const offerId1 = await createLenderOffer();
      const offerId2 = await createLenderOffer();
      await acceptLenderOffer(offerId1);
      await acceptLenderOffer(offerId2);
      const activeLoans = await lens.getUserActiveLoans(lender.address);
      expect(activeLoans.length).to.equal(2);
    });
  });

  // ============ 7. getLoanAmountDue ============

  describe("getLoanAmountDue", function () {
    it("Should return correct amount due (principal + interest)", async function () {
      const offerId = await createLenderOffer();
      const loanId = await acceptLenderOffer(offerId);
      const amountDue = await lens.getLoanAmountDue(loanId);
      const expected = PRINCIPAL + (PRINCIPAL * BigInt(INTEREST_RATE)) / 10000n;
      expect(amountDue).to.equal(expected);
    });

    it("Should return 0 for non-existent loan", async function () {
      expect(await lens.getLoanAmountDue(9999)).to.equal(0);
    });

    it("Should return 0 for a PENDING/CANCELLED status loan (ID 0)", async function () {
      // Loan ID 0 is the zero-value struct — status = PENDING (0)
      expect(await lens.getLoanAmountDue(0)).to.equal(0);
    });
  });
});
