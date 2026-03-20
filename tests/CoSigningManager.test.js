const { expect } = require("chai");
const { ethers } = require("hardhat");

async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

describe("CoSigningManager", function () {
  // ============ Constants ============
  const MIN_COSIGNER_REPUTATION = 50;
  const ONE_DAY = 86400;
  const THIRTY_DAYS = 30 * ONE_DAY;
  const PRINCIPAL = ethers.parseEther("100");
  const INTEREST_RATE = 1000; // 10%
  const ETH_PRICE = 200000000000n;

  // ============ Shared State ============
  let coSigningManager,
    lendingPool,
    reputationManager,
    collateralManager,
    priceOracle;
  let loanToken, collateralToken, ethFeed, collateralFeed;
  let owner, feeCollector, lender, borrower, coSigner, other;
  let LENDING_POOL_ROLE, COSIGNING_ROLE, DEFAULT_ADMIN_ROLE;

  beforeEach(async function () {
    [owner, feeCollector, lender, borrower, coSigner, other] =
      await ethers.getSigners();

    // ── Mock price feeds ──
    const MockAgg = await ethers.getContractFactory("MockV3Aggregator");
    ethFeed = await MockAgg.deploy(8, ETH_PRICE);
    collateralFeed = await MockAgg.deploy(8, ETH_PRICE);
    await ethFeed.waitForDeployment();
    await collateralFeed.waitForDeployment();

    // ── PriceOracle ──
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();

    // ── Mock tokens ──
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    loanToken = await MockERC20.deploy("Loan Token", "LTK", 18);
    collateralToken = await MockERC20.deploy("Collateral Token", "CTK", 18);
    await loanToken.waitForDeployment();
    await collateralToken.waitForDeployment();

    await priceOracle.setPriceFeed(
      await loanToken.getAddress(),
      await ethFeed.getAddress(),
      "LTK",
    );
    await priceOracle.setPriceFeed(
      await collateralToken.getAddress(),
      await collateralFeed.getAddress(),
      "CTK",
    );

    // ── ReputationManager ──
    const ReputationManager =
      await ethers.getContractFactory("ReputationManager");
    reputationManager = await ReputationManager.deploy();
    await reputationManager.waitForDeployment();

    // ── CollateralManager ──
    const CollateralManager =
      await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(
      await priceOracle.getAddress(),
    );
    await collateralManager.waitForDeployment();
    await collateralManager.addSupportedToken(
      await collateralToken.getAddress(),
      18,
      ethers.parseEther("10000000"),
      500,
    );

    // ── LendingPool ──
    const LendingPool = await ethers.getContractFactory("LendingPool");
    lendingPool = await LendingPool.deploy(
      await reputationManager.getAddress(),
      await collateralManager.getAddress(),
      feeCollector.address,
    );
    await lendingPool.waitForDeployment();

    // ── CoSigningManager ──
    const CoSigningManager =
      await ethers.getContractFactory("CoSigningManager");
    coSigningManager = await CoSigningManager.deploy(
      await reputationManager.getAddress(),
      await lendingPool.getAddress(),
    );
    await coSigningManager.waitForDeployment();

    // ── Wire up roles ──
    LENDING_POOL_ROLE = await reputationManager.LENDING_POOL_ROLE();
    COSIGNING_ROLE = await reputationManager.COSIGNING_ROLE();
    DEFAULT_ADMIN_ROLE = await coSigningManager.DEFAULT_ADMIN_ROLE();

    await reputationManager.grantRole(
      LENDING_POOL_ROLE,
      await lendingPool.getAddress(),
    );
    await reputationManager.grantRole(
      COSIGNING_ROLE,
      await coSigningManager.getAddress(),
    );
    await collateralManager.grantRole(
      await collateralManager.LENDING_POOL_ROLE(),
      await lendingPool.getAddress(),
    );
    await lendingPool.setCoSigningManager(await coSigningManager.getAddress());

    // ── Mint tokens and initialize reputations ──
    await loanToken.mint(lender.address, ethers.parseEther("100000"));
    await loanToken.mint(borrower.address, ethers.parseEther("100000"));
    await loanToken.mint(coSigner.address, ethers.parseEther("100000"));

    const DATA_FEED_ROLE = await reputationManager.DATA_FEED_ROLE();
    await reputationManager.grantRole(DATA_FEED_ROLE, owner.address);
    await reputationManager.initializeReputation(lender.address);
    await reputationManager.initializeReputation(borrower.address);
    await reputationManager.initializeReputation(coSigner.address);
    await reputationManager.initializeReputation(other.address);
  });

  // ── Helpers ──

  async function createBorrowOffer(user = borrower) {
    const terms = {
      tokenAddress: await loanToken.getAddress(),
      principalAmount: PRINCIPAL,
      collateralAmount: 0,
      collateralToken: await collateralToken.getAddress(),
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

  async function createRequest(
    offerId,
    user = borrower,
    bonus = 10,
    msg = "Please co-sign",
  ) {
    const tx = await coSigningManager
      .connect(user)
      .createCoSigningRequest(offerId, bonus, msg);
    const receipt = await tx.wait();
    return receipt.logs.find(
      (l) => l.fragment?.name === "CoSigningRequestCreated",
    ).args[0];
  }

  async function acceptRequest(requestId, user = coSigner) {
    const tx = await coSigningManager
      .connect(user)
      .acceptCoSigningRequest(requestId);
    const receipt = await tx.wait();
    return receipt.logs.find((l) => l.fragment?.name === "CoSigningCompleted")
      .args[0];
  }

  // ============ 1. Deployment ============

  describe("Deployment", function () {
    it("Should store reputationManager and lendingPool addresses", async function () {
      expect(await coSigningManager.reputationManager()).to.equal(
        await reputationManager.getAddress(),
      );
      expect(await coSigningManager.lendingPool()).to.equal(
        await lendingPool.getAddress(),
      );
    });

    it("Should start with nextRequestId = 1 and nextRecordId = 1", async function () {
      expect(await coSigningManager.nextRequestId()).to.equal(1);
      expect(await coSigningManager.nextRecordId()).to.equal(1);
    });

    it("Should have correct constants", async function () {
      expect(await coSigningManager.MIN_COSIGNER_REPUTATION()).to.equal(
        MIN_COSIGNER_REPUTATION,
      );
      expect(await coSigningManager.MAX_COSIGNERS_PER_LOAN()).to.equal(3);
      expect(await coSigningManager.MAX_BONUS_PERCENTAGE()).to.equal(50);
    });

    it("Should revert on zero address constructor args", async function () {
      const CoSigningManager =
        await ethers.getContractFactory("CoSigningManager");
      await expect(
        CoSigningManager.deploy(
          ethers.ZeroAddress,
          await lendingPool.getAddress(),
        ),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__InvalidAddress",
      );

      await expect(
        CoSigningManager.deploy(
          await reputationManager.getAddress(),
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__InvalidAddress",
      );
    });

    it("Should grant LENDING_POOL_ROLE to lendingPool address", async function () {
      const role = await coSigningManager.LENDING_POOL_ROLE();
      expect(
        await coSigningManager.hasRole(role, await lendingPool.getAddress()),
      ).to.be.true;
    });
  });

  // ============ 2. createCoSigningRequest ============

  describe("createCoSigningRequest", function () {
    it("Should create a request and return a requestId", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      expect(requestId).to.equal(1n);
    });

    it("Should store request data correctly", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId, borrower, 10, "help me");
      const req = await coSigningManager.getCoSigningRequest(requestId);

      expect(req.borrower).to.equal(borrower.address);
      expect(req.loanOfferId).to.equal(offerId);
      expect(req.isActive).to.be.true;
      expect(req.message).to.equal("help me");
    });

    it("Should increment nextRequestId", async function () {
      const offerId = await createBorrowOffer();
      await createRequest(offerId);
      expect(await coSigningManager.nextRequestId()).to.equal(2);
    });

    it("Should mark offer as having an active request", async function () {
      const offerId = await createBorrowOffer();
      await createRequest(offerId);
      expect(await coSigningManager.offerHasActiveRequest(offerId)).to.be.true;
    });

    it("Should emit CoSigningRequestCreated event", async function () {
      const offerId = await createBorrowOffer();
      await expect(
        coSigningManager
          .connect(borrower)
          .createCoSigningRequest(offerId, 10, "test"),
      ).to.emit(coSigningManager, "CoSigningRequestCreated");
    });

    it("Should revert on zero bonus", async function () {
      const offerId = await createBorrowOffer();
      await expect(
        coSigningManager
          .connect(borrower)
          .createCoSigningRequest(offerId, 0, "test"),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__InvalidBonus",
      );
    });

    it("Should revert if caller is not the offer creator", async function () {
      const offerId = await createBorrowOffer(borrower);
      await expect(
        coSigningManager
          .connect(other)
          .createCoSigningRequest(offerId, 10, "test"),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__UnauthorizedCancellation",
      );
    });

    it("Should revert on non-existent offer", async function () {
      await expect(
        coSigningManager
          .connect(borrower)
          .createCoSigningRequest(999, 10, "test"),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__LoanNotFound",
      );
    });

    it("Should revert if a request already exists for the offer", async function () {
      const offerId = await createBorrowOffer();
      await createRequest(offerId);
      await expect(
        coSigningManager
          .connect(borrower)
          .createCoSigningRequest(offerId, 10, "again"),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RequestAlreadyExists",
      );
    });

    it("Should revert on duplicate request for an offer that is already co-signed (active request remains)", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);
      // After accept: request.isActive = false but offerHasActiveRequest stays true,
      // so a new createCoSigningRequest hits RequestAlreadyExists before AlreadyCoSigned.
      await expect(
        coSigningManager
          .connect(borrower)
          .createCoSigningRequest(offerId, 10, "again"),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RequestAlreadyExists",
      );
      // Confirm co-signer is indeed set (AlreadyCoSigned guard is also in place)
      expect(await coSigningManager.offerCoSigner(offerId)).to.equal(
        coSigner.address,
      );
    });
  });

  // ============ 3. cancelCoSigningRequest ============

  describe("cancelCoSigningRequest", function () {
    it("Should cancel an active request", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await coSigningManager
        .connect(borrower)
        .cancelCoSigningRequest(requestId);
      const req = await coSigningManager.getCoSigningRequest(requestId);
      expect(req.isActive).to.be.false;
    });

    it("Should clear offerHasActiveRequest flag", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await coSigningManager
        .connect(borrower)
        .cancelCoSigningRequest(requestId);
      expect(await coSigningManager.offerHasActiveRequest(offerId)).to.be.false;
    });

    it("Should emit CoSigningRequestCancelled event", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await expect(
        coSigningManager.connect(borrower).cancelCoSigningRequest(requestId),
      )
        .to.emit(coSigningManager, "CoSigningRequestCancelled")
        .withArgs(requestId, borrower.address);
    });

    it("Should allow a new request after cancellation", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await coSigningManager
        .connect(borrower)
        .cancelCoSigningRequest(requestId);
      // Should not revert
      await expect(
        coSigningManager
          .connect(borrower)
          .createCoSigningRequest(offerId, 10, "retry"),
      ).to.not.be.reverted;
    });

    it("Should revert cancellation by non-borrower", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await expect(
        coSigningManager.connect(other).cancelCoSigningRequest(requestId),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__UnauthorizedCancellation",
      );
    });

    it("Should revert cancellation of already inactive request", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await coSigningManager
        .connect(borrower)
        .cancelCoSigningRequest(requestId);
      await expect(
        coSigningManager.connect(borrower).cancelCoSigningRequest(requestId),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RequestNotActive",
      );
    });

    it("Should revert on non-existent request", async function () {
      await expect(
        coSigningManager.connect(borrower).cancelCoSigningRequest(999),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RequestNotFound",
      );
    });
  });

  // ============ 4. acceptCoSigningRequest ============

  describe("acceptCoSigningRequest", function () {
    it("Should create a co-signing record and return recordId", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      expect(recordId).to.equal(1n);
    });

    it("Should store record data correctly", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      const record = await coSigningManager.getCoSigningRecord(recordId);

      expect(record.coSigner).to.equal(coSigner.address);
      expect(record.borrower).to.equal(borrower.address);
      expect(record.isActive).to.be.true;
      expect(record.loanCompleted).to.be.false;
      expect(record.loanId).to.equal(0); // not yet linked to a loan
    });

    it("Should deactivate the request after acceptance", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);
      const req = await coSigningManager.getCoSigningRequest(requestId);
      expect(req.isActive).to.be.false;
    });

    it("Should set offerCoSigner mapping", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);
      expect(await coSigningManager.offerCoSigner(offerId)).to.equal(
        coSigner.address,
      );
    });

    it("Should increment nextRecordId", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);
      expect(await coSigningManager.nextRecordId()).to.equal(2);
    });

    it("Should emit CoSigningCompleted event", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await expect(
        coSigningManager.connect(coSigner).acceptCoSigningRequest(requestId),
      ).to.emit(coSigningManager, "CoSigningCompleted");
    });

    it("Should provide a bonus to the borrower", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      const record = await coSigningManager.getCoSigningRecord(recordId);
      expect(record.bonusProvided).to.be.gt(0);
    });

    it("Should revert if co-signer is the borrower (self-signing)", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await expect(
        coSigningManager.connect(borrower).acceptCoSigningRequest(requestId),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__CannotCoSignSelf",
      );
    });

    it("Should revert if co-signer has insufficient reputation", async function () {
      // other has fresh init reputation which should be below MIN_COSIGNER_REPUTATION
      // Force reputation to 0 by not initializing (getReputationScore returns 0)
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);

      // Deploy a fresh user with no reputation at all
      const [, , , , , , freshUser] = await ethers.getSigners();
      await expect(
        coSigningManager.connect(freshUser).acceptCoSigningRequest(requestId),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__InsufficientReputation",
      );
    });

    it("Should revert on non-existent request", async function () {
      await expect(
        coSigningManager.connect(coSigner).acceptCoSigningRequest(999),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RequestNotFound",
      );
    });

    it("Should revert on already inactive request", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await coSigningManager
        .connect(borrower)
        .cancelCoSigningRequest(requestId);
      await expect(
        coSigningManager.connect(coSigner).acceptCoSigningRequest(requestId),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RequestNotActive",
      );
    });
  });

  // ============ 5. cancelCoSigningRecord ============

  describe("cancelCoSigningRecord", function () {
    it("Should mark record as inactive and cancelled", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      await coSigningManager.connect(borrower).cancelCoSigningRecord(recordId);
      const record = await coSigningManager.getCoSigningRecord(recordId);
      expect(record.isActive).to.be.false;
      expect(record.wasCancelled).to.be.true;
    });

    it("Should emit CoSigningRecordCancelled event", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      await expect(
        coSigningManager.connect(borrower).cancelCoSigningRecord(recordId),
      ).to.emit(coSigningManager, "CoSigningRecordCancelled");
    });

    it("Should emit CoSigningReleased event", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      await expect(
        coSigningManager.connect(borrower).cancelCoSigningRecord(recordId),
      ).to.emit(coSigningManager, "CoSigningReleased");
    });

    it("Should allow admin (DEFAULT_ADMIN_ROLE) to cancel", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      await expect(
        coSigningManager.connect(owner).cancelCoSigningRecord(recordId),
      ).to.not.be.reverted;
    });

    it("Should revert cancellation by unauthorised user", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      await expect(
        coSigningManager.connect(other).cancelCoSigningRecord(recordId),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__UnauthorizedCancellation",
      );
    });

    it("Should revert on non-existent record", async function () {
      await expect(
        coSigningManager.connect(borrower).cancelCoSigningRecord(999),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RecordNotFound",
      );
    });

    it("Should revert on already inactive record", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      await coSigningManager.connect(borrower).cancelCoSigningRecord(recordId);
      await expect(
        coSigningManager.connect(borrower).cancelCoSigningRecord(recordId),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RecordNotActive",
      );
    });
  });

  // ============ 6. releaseCoSigning ============

  describe("releaseCoSigning", function () {
    async function setupActiveRecord() {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      return acceptRequest(requestId);
    }

    it("Should mark record as completed on successful release", async function () {
      const recordId = await setupActiveRecord();
      await coSigningManager.connect(owner).releaseCoSigning(recordId, true);
      const record = await coSigningManager.getCoSigningRecord(recordId);
      expect(record.isActive).to.be.false;
      expect(record.loanCompleted).to.be.true;
      expect(record.borrowerDefaulted).to.be.false;
    });

    it("Should mark borrowerDefaulted on failed release", async function () {
      const recordId = await setupActiveRecord();
      await coSigningManager.connect(owner).releaseCoSigning(recordId, false);
      const record = await coSigningManager.getCoSigningRecord(recordId);
      expect(record.borrowerDefaulted).to.be.true;
    });

    it("Should emit CoSigningReleased event", async function () {
      const recordId = await setupActiveRecord();
      await expect(
        coSigningManager.connect(owner).releaseCoSigning(recordId, true),
      ).to.emit(coSigningManager, "CoSigningReleased");
    });

    it("Should emit CoSignerPenalized on default", async function () {
      const recordId = await setupActiveRecord();
      await expect(
        coSigningManager.connect(owner).releaseCoSigning(recordId, false),
      ).to.emit(coSigningManager, "CoSignerPenalized");
    });

    it("Should emit CoSignerRewarded on success", async function () {
      const recordId = await setupActiveRecord();
      await expect(
        coSigningManager.connect(owner).releaseCoSigning(recordId, true),
      ).to.emit(coSigningManager, "CoSignerRewarded");
    });

    it("Should revert on non-existent record", async function () {
      await expect(
        coSigningManager.connect(owner).releaseCoSigning(999, true),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RecordNotFound",
      );
    });

    it("Should revert on already inactive record", async function () {
      const recordId = await setupActiveRecord();
      await coSigningManager.connect(owner).releaseCoSigning(recordId, true);
      await expect(
        coSigningManager.connect(owner).releaseCoSigning(recordId, true),
      ).to.be.revertedWithCustomError(
        coSigningManager,
        "CoSigningManager__RecordNotActive",
      );
    });
  });

  // ============ 7. handleOfferCancelled ============

  describe("handleOfferCancelled", function () {
    it("Should deactivate record when called by LENDING_POOL_ROLE", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);

      const lpRole = await coSigningManager.LENDING_POOL_ROLE();
      await coSigningManager.grantRole(lpRole, owner.address);

      await coSigningManager
        .connect(owner)
        .handleOfferCancelled(offerId, borrower.address);
      const record = await coSigningManager.getCoSigningRecord(recordId);
      expect(record.isActive).to.be.false;
    });

    it("Should revert if called by non LENDING_POOL_ROLE", async function () {
      const offerId = await createBorrowOffer();
      await createRequest(offerId);
      await expect(
        coSigningManager
          .connect(other)
          .handleOfferCancelled(offerId, borrower.address),
      ).to.be.reverted;
    });
  });

  // ============ 8. isCoSignerForOffer ============

  describe("isCoSignerForOffer", function () {
    it("Should return false before any co-signing", async function () {
      const offerId = await createBorrowOffer();
      expect(
        await coSigningManager.isCoSignerForOffer(offerId, coSigner.address),
      ).to.be.false;
    });

    it("Should return true after co-signer accepts request", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);
      expect(
        await coSigningManager.isCoSignerForOffer(offerId, coSigner.address),
      ).to.be.true;
    });

    it("Should return false for a different address", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);
      expect(await coSigningManager.isCoSignerForOffer(offerId, other.address))
        .to.be.false;
    });
  });

  // ============ 9. calculateCoSigningBonus ============

  describe("calculateCoSigningBonus", function () {
    it("Should return a non-zero bonus preview", async function () {
      const bonus = await coSigningManager.calculateCoSigningBonus(
        borrower.address,
        coSigner.address,
      );
      expect(bonus).to.be.gt(0);
    });

    it("Should return lower bonus for repeated co-signing of same pair", async function () {
      const firstBonus = await coSigningManager.calculateCoSigningBonus(
        borrower.address,
        coSigner.address,
      );

      // Do a co-sign to increment the count
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);

      const secondBonus = await coSigningManager.calculateCoSigningBonus(
        borrower.address,
        coSigner.address,
      );
      expect(secondBonus).to.be.lt(firstBonus);
    });
  });

  // ============ 10. View Functions ============

  describe("View Functions", function () {
    it("getCoSigningRequest: returns correct request data", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId, borrower, 10, "view test");
      const req = await coSigningManager.getCoSigningRequest(requestId);
      expect(req.requestId).to.equal(requestId);
      expect(req.message).to.equal("view test");
    });

    it("getCoSigningRecord: returns correct record data", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      const record = await coSigningManager.getCoSigningRecord(recordId);
      expect(record.recordId).to.equal(recordId);
      expect(record.coSigner).to.equal(coSigner.address);
    });

    it("getCoSigningRequests: tracks all requests for borrower", async function () {
      const offerId1 = await createBorrowOffer();
      await createRequest(offerId1);
      const requests = await coSigningManager.getCoSigningRequests(
        borrower.address,
      );
      expect(requests.length).to.equal(1);
    });

    it("getUserCoSignings: tracks all records for co-signer", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);
      const signings = await coSigningManager.getUserCoSignings(
        coSigner.address,
      );
      expect(signings.length).to.equal(1);
    });

    it("getActiveCoSigningRequests: returns only active requests", async function () {
      const offerId1 = await createBorrowOffer(borrower);
      const requestId1 = await createRequest(offerId1);
      // Cancel it
      await coSigningManager
        .connect(borrower)
        .cancelCoSigningRequest(requestId1);

      const active = await coSigningManager.getActiveCoSigningRequests(
        borrower.address,
      );
      expect(active.length).to.equal(0);
    });

    it("getActiveCoSignings: returns only active co-signing records", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);

      let active = await coSigningManager.getActiveCoSignings(coSigner.address);
      expect(active.length).to.equal(1);

      await coSigningManager.connect(owner).releaseCoSigning(recordId, true);
      active = await coSigningManager.getActiveCoSignings(coSigner.address);
      expect(active.length).to.equal(0);
    });

    it("getAllOpenRequests: returns all open requests across borrowers", async function () {
      const offerId1 = await createBorrowOffer(borrower);
      await createRequest(offerId1);
      const open = await coSigningManager.getAllOpenRequests();
      expect(open.length).to.equal(1);
    });

    it("getRecordsByOffer: returns record ids for an offer", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      await acceptRequest(requestId);
      const records = await coSigningManager.getRecordsByOffer(offerId);
      expect(records.length).to.equal(1);
    });

    it("getLoanCoSigners: returns record ids linked to a loan", async function () {
      // Nothing linked yet — should be empty
      const records = await coSigningManager.getLoanCoSigners(1);
      expect(records.length).to.equal(0);
    });

    it("getCoSigningStats: returns correct initial stats", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);

      const [total, active, successful, defaulted] =
        await coSigningManager.getCoSigningStats(coSigner.address);

      expect(total).to.equal(1);
      expect(active).to.equal(1);
      expect(successful).to.equal(0);
      expect(defaulted).to.equal(0);
    });

    it("getCoSigningStats: updates after successful release", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      await coSigningManager.connect(owner).releaseCoSigning(recordId, true);

      const [total, active, successful, defaulted] =
        await coSigningManager.getCoSigningStats(coSigner.address);

      expect(total).to.equal(1);
      expect(active).to.equal(0);
      expect(successful).to.equal(1);
      expect(defaulted).to.equal(0);
    });

    it("getCoSigningStats: updates after default", async function () {
      const offerId = await createBorrowOffer();
      const requestId = await createRequest(offerId);
      const recordId = await acceptRequest(requestId);
      await coSigningManager.connect(owner).releaseCoSigning(recordId, false);

      const [total, active, successful, defaulted] =
        await coSigningManager.getCoSigningStats(coSigner.address);

      expect(defaulted).to.equal(1);
      expect(successful).to.equal(0);
    });

    it("hasDiminishingReturns: returns false before any co-sign", async function () {
      expect(
        await coSigningManager.hasDiminishingReturns(
          coSigner.address,
          borrower.address,
        ),
      ).to.be.false;
    });
  });
});
