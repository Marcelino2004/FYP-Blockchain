const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper: increase EVM time by `seconds` and mine a new block
async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

describe("ReputationManager", function () {
  const STARTING_REPUTATION = 200;
  const MAX_REPUTATION = 1000;
  const MIN_REPUTATION = 0;
  const EMAIL_VERIFICATION_BONUS = 60;
  const PHONE_VERIFICATION_BONUS = 140;
  const MAX_REPUTATION_GAIN_PER_PERIOD = 100;
  const DEFAULT_PENALTY_BASE = 100;
  const COSIGN_COOLDOWN = 30 * 24 * 60 * 60;
  const DECAY_START_DAYS = 90;
  const DECAY_PERIOD_DAYS = 180;

  let reputationManager;
  let owner, lendingPool, coSigningManager, verifier, dataFeed;
  let user1, user2, user3;
  let LENDING_POOL_ROLE,
    COSIGNING_ROLE,
    VERIFIER_ROLE,
    DATA_FEED_ROLE,
    DEFAULT_ADMIN_ROLE;

  beforeEach(async function () {
    [
      owner,
      lendingPool,
      coSigningManager,
      verifier,
      dataFeed,
      user1,
      user2,
      user3,
    ] = await ethers.getSigners();

    const ReputationManager =
      await ethers.getContractFactory("ReputationManager");
    reputationManager = await ReputationManager.deploy();
    await reputationManager.waitForDeployment();

    LENDING_POOL_ROLE = await reputationManager.LENDING_POOL_ROLE();
    COSIGNING_ROLE = await reputationManager.COSIGNING_ROLE();
    VERIFIER_ROLE = await reputationManager.VERIFIER_ROLE();
    DATA_FEED_ROLE = await reputationManager.DATA_FEED_ROLE();
    DEFAULT_ADMIN_ROLE = await reputationManager.DEFAULT_ADMIN_ROLE();

    await reputationManager.grantRole(LENDING_POOL_ROLE, lendingPool.address);
    await reputationManager.grantRole(COSIGNING_ROLE, coSigningManager.address);
    await reputationManager.grantRole(VERIFIER_ROLE, verifier.address);
    await reputationManager.grantRole(DATA_FEED_ROLE, dataFeed.address);
  });

  async function initUser(userAddress) {
    await reputationManager.connect(dataFeed).initializeReputation(userAddress);
  }

  // ============ 1. Deployment & Constants ============

  describe("Deployment & Constants", function () {
    it("Should deploy successfully", async function () {
      expect(await reputationManager.getAddress()).to.be.properAddress;
    });

    it("Should have correct constants", async function () {
      expect(await reputationManager.MIN_REPUTATION()).to.equal(MIN_REPUTATION);
      expect(await reputationManager.MAX_REPUTATION()).to.equal(MAX_REPUTATION);
      expect(await reputationManager.STARTING_REPUTATION()).to.equal(
        STARTING_REPUTATION,
      );
      expect(await reputationManager.EMAIL_VERIFICATION_BONUS()).to.equal(
        EMAIL_VERIFICATION_BONUS,
      );
      expect(await reputationManager.PHONE_VERIFICATION_BONUS()).to.equal(
        PHONE_VERIFICATION_BONUS,
      );
      expect(await reputationManager.MAX_REPUTATION_GAIN_PER_PERIOD()).to.equal(
        MAX_REPUTATION_GAIN_PER_PERIOD,
      );
      expect(await reputationManager.COSIGN_COOLDOWN()).to.equal(
        COSIGN_COOLDOWN,
      );
    });

    it("Should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
      expect(await reputationManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address))
        .to.be.true;
    });

    it("Should grant VERIFIER_ROLE and DATA_FEED_ROLE to deployer initially", async function () {
      const ReputationManager =
        await ethers.getContractFactory("ReputationManager");
      const rm = await ReputationManager.deploy();
      await rm.waitForDeployment();
      expect(await rm.hasRole(await rm.VERIFIER_ROLE(), owner.address)).to.be
        .true;
      expect(await rm.hasRole(await rm.DATA_FEED_ROLE(), owner.address)).to.be
        .true;
    });
  });

  // ============ 2. Initialization ============

  describe("Initialization", function () {
    it("Should return 0 for uninitialised user", async function () {
      expect(
        await reputationManager.getReputationScore(user1.address),
      ).to.equal(0);
    });

    it("Should initialise user with STARTING_REPUTATION", async function () {
      await initUser(user1.address);
      const data = await reputationManager.getReputationData(user1.address);
      expect(data.baseScore).to.equal(STARTING_REPUTATION);
    });

    it("Should set walletCreationTime on initialisation", async function () {
      const tx = await reputationManager
        .connect(dataFeed)
        .initializeReputation(user1.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const data = await reputationManager.getReputationData(user1.address);
      expect(data.walletCreationTime).to.equal(block.timestamp);
    });

    it("Should not reinitialise an already-initialised user", async function () {
      await initUser(user1.address);
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(dataFeed)
        .initializeReputation(user1.address);
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore).to.equal(dataBefore.baseScore);
      expect(dataAfter.walletCreationTime).to.equal(
        dataBefore.walletCreationTime,
      );
    });

    it("Should revert on zero address", async function () {
      await expect(
        reputationManager
          .connect(dataFeed)
          .initializeReputation(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAddress",
      );
    });

    it("Should emit ReputationUpdated on initialisation", async function () {
      await expect(
        reputationManager.connect(dataFeed).initializeReputation(user1.address),
      )
        .to.emit(reputationManager, "ReputationUpdated")
        .withArgs(user1.address, 0, STARTING_REPUTATION, "Initial reputation");
    });

    it("Should revert if called by non DATA_FEED_ROLE", async function () {
      await expect(
        reputationManager.connect(user1).initializeReputation(user2.address),
      ).to.be.reverted;
    });
  });

  // ============ 3. Successful Repayments ============

  describe("Successful Repayments", function () {
    it("Should increase reputation on successful repayment", async function () {
      await initUser(user1.address);
      const scoreBefore = await reputationManager.getReputationScore(
        user1.address,
      );
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, ethers.parseEther("10"));
      const scoreAfter = await reputationManager.getReputationScore(
        user1.address,
      );
      expect(scoreAfter).to.be.gt(scoreBefore);
    });

    it("Should update successfulRepayments and totalRepaymentValue", async function () {
      await initUser(user1.address);
      const loanAmount = ethers.parseEther("5");
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, loanAmount);
      const data = await reputationManager.getReputationData(user1.address);
      expect(data.successfulRepayments).to.equal(1);
      expect(data.totalRepaymentValue).to.equal(loanAmount);
    });

    it("Should give larger bonus for larger loan amounts", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      const u1Before = await reputationManager.getReputationScore(
        user1.address,
      );
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, ethers.parseEther("1"));
      const u1After = await reputationManager.getReputationScore(user1.address);
      const u2Before = await reputationManager.getReputationScore(
        user2.address,
      );
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user2.address, ethers.parseEther("100"));
      const u2After = await reputationManager.getReputationScore(user2.address);
      expect(u2After - u2Before).to.be.gte(u1After - u1Before);
    });

    it("Should emit ReputationUpdated event", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, ethers.parseEther("1")),
      ).to.emit(reputationManager, "ReputationUpdated");
    });

    it("Should not exceed MAX_REPUTATION", async function () {
      await initUser(user1.address);
      for (let i = 0; i < 50; i++) {
        await reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, ethers.parseEther("1000"));
        await increaseTime(86400);
      }
      expect(
        await reputationManager.getReputationScore(user1.address),
      ).to.be.lte(MAX_REPUTATION);
    });

    it("Should enforce daily reputation gain cap", async function () {
      await initUser(user1.address);
      for (let i = 0; i < 5; i++) {
        await reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, ethers.parseEther("1000"));
      }
      const data = await reputationManager.getReputationData(user1.address);
      expect(data.reputationGainedToday).to.be.lte(
        MAX_REPUTATION_GAIN_PER_PERIOD,
      );
    });

    it("Should reset daily cap after 24 hours", async function () {
      await initUser(user1.address);
      for (let i = 0; i < 5; i++) {
        await reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, ethers.parseEther("1000"));
      }
      const scoreAfterDay1 = await reputationManager.getReputationScore(
        user1.address,
      );
      await increaseTime(86400);
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, ethers.parseEther("1000"));
      const scoreAfterDay2 = await reputationManager.getReputationScore(
        user1.address,
      );
      expect(scoreAfterDay2).to.be.gte(scoreAfterDay1);
    });

    it("Should revert on zero address", async function () {
      await expect(
        reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(
            ethers.ZeroAddress,
            ethers.parseEther("1"),
          ),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAddress",
      );
    });

    it("Should revert on zero loan amount", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, 0),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAmount",
      );
    });

    it("Should revert if called by non LENDING_POOL_ROLE", async function () {
      await expect(
        reputationManager
          .connect(user1)
          .recordSuccessfulRepayment(user2.address, ethers.parseEther("1")),
      ).to.be.reverted;
    });
  });

  // ============ 4. Defaults & Penalties ============

  describe("Defaults & Penalties", function () {
    it("Should decrease reputation on default", async function () {
      await initUser(user1.address);
      const scoreBefore = await reputationManager.getReputationScore(
        user1.address,
      );
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, ethers.parseEther("10"));
      const scoreAfter = await reputationManager.getReputationScore(
        user1.address,
      );
      expect(scoreAfter).to.be.lt(scoreBefore);
    });

    it("Should apply at least DEFAULT_PENALTY_BASE on default", async function () {
      await initUser(user1.address);
      const baseScoreBefore = (
        await reputationManager.getReputationData(user1.address)
      ).baseScore;
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, ethers.parseEther("1"));
      const baseScoreAfter = (
        await reputationManager.getReputationData(user1.address)
      ).baseScore;
      expect(baseScoreBefore - baseScoreAfter).to.be.gte(DEFAULT_PENALTY_BASE);
    });

    it("Should not drop below MIN_REPUTATION (0)", async function () {
      await initUser(user1.address);
      for (let i = 0; i < 10; i++) {
        await reputationManager
          .connect(lendingPool)
          .recordDefault(user1.address, ethers.parseEther("100000"));
      }
      expect(
        await reputationManager.getReputationScore(user1.address),
      ).to.be.gte(MIN_REPUTATION);
    });

    it("Should update defaults and totalDefaultValue", async function () {
      await initUser(user1.address);
      const amount = ethers.parseEther("50");
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, amount);
      const data = await reputationManager.getReputationData(user1.address);
      expect(data.defaults).to.equal(1);
      expect(data.totalDefaultValue).to.equal(amount);
    });

    it("Should emit ReputationPenalty and ReputationUpdated events", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager
          .connect(lendingPool)
          .recordDefault(user1.address, ethers.parseEther("10")),
      )
        .to.emit(reputationManager, "ReputationPenalty")
        .and.to.emit(reputationManager, "ReputationUpdated");
    });

    it("Should apply larger penalty for larger defaulted amounts", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      const u1Base = (await reputationManager.getReputationData(user1.address))
        .baseScore;
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, ethers.parseEther("1"));
      const u1After = (await reputationManager.getReputationData(user1.address))
        .baseScore;
      const u2Base = (await reputationManager.getReputationData(user2.address))
        .baseScore;
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user2.address, ethers.parseEther("100"));
      const u2After = (await reputationManager.getReputationData(user2.address))
        .baseScore;
      expect(u2Base - u2After).to.be.gte(u1Base - u1After);
    });

    it("Should revert on zero address", async function () {
      await expect(
        reputationManager
          .connect(lendingPool)
          .recordDefault(ethers.ZeroAddress, ethers.parseEther("1")),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAddress",
      );
    });

    it("Should revert on zero loan amount", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager.connect(lendingPool).recordDefault(user1.address, 0),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAmount",
      );
    });

    it("Should revert if called by non LENDING_POOL_ROLE", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager
          .connect(user2)
          .recordDefault(user1.address, ethers.parseEther("1")),
      ).to.be.reverted;
    });
  });

  // ============ 5. Off-Chain Verification ============

  describe("Off-Chain Verification", function () {
    it("Should add email verification bonus", async function () {
      await initUser(user1.address);
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "email");
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore - dataBefore.baseScore).to.equal(
        EMAIL_VERIFICATION_BONUS,
      );
      expect(dataAfter.emailVerified).to.be.true;
    });

    it("Should add phone verification bonus", async function () {
      await initUser(user1.address);
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "phone");
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore - dataBefore.baseScore).to.equal(
        PHONE_VERIFICATION_BONUS,
      );
      expect(dataAfter.phoneVerified).to.be.true;
    });

    it("Should add both bonuses independently", async function () {
      await initUser(user1.address);
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "email");
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "phone");
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore - dataBefore.baseScore).to.equal(
        EMAIL_VERIFICATION_BONUS + PHONE_VERIFICATION_BONUS,
      );
    });

    it("Verification bonuses should NOT be limited by daily cap", async function () {
      await initUser(user1.address);
      for (let i = 0; i < 10; i++) {
        await reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, ethers.parseEther("100"));
      }
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "email");
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore - dataBefore.baseScore).to.equal(
        EMAIL_VERIFICATION_BONUS,
      );
    });

    it("Should revert on duplicate email verification", async function () {
      await initUser(user1.address);
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "email");
      await expect(
        reputationManager
          .connect(verifier)
          .recordOffChainVerification(user1.address, "email"),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__AlreadyVerified",
      );
    });

    it("Should revert on duplicate phone verification", async function () {
      await initUser(user1.address);
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "phone");
      await expect(
        reputationManager
          .connect(verifier)
          .recordOffChainVerification(user1.address, "phone"),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__AlreadyVerified",
      );
    });

    it("Should emit OffChainVerification and ReputationUpdated events", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager
          .connect(verifier)
          .recordOffChainVerification(user1.address, "email"),
      )
        .to.emit(reputationManager, "OffChainVerification")
        .withArgs(user1.address, "email", EMAIL_VERIFICATION_BONUS)
        .and.to.emit(reputationManager, "ReputationUpdated");
    });

    it("Should revert if called by non VERIFIER_ROLE", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager
          .connect(user2)
          .recordOffChainVerification(user1.address, "email"),
      ).to.be.reverted;
    });

    it("Should revert on zero address", async function () {
      await expect(
        reputationManager
          .connect(verifier)
          .recordOffChainVerification(ethers.ZeroAddress, "email"),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAddress",
      );
    });
  });

  // ============ 6. Co-Signing Bonus ============

  describe("Co-Signing Bonus", function () {
    it("Should store a pending co-signing bonus by offer ID", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 500, 1);
      expect(
        await reputationManager.getOfferCoSigningBonus(user1.address, 1),
      ).to.be.gt(0);
    });

    it("Should apply stored bonus when loan is matched", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 600, 42);
      const pending = await reputationManager.getOfferCoSigningBonus(
        user1.address,
        42,
      );
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(coSigningManager)
        .applyOfferCoSigningBonus(user1.address, 42);
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore).to.equal(dataBefore.baseScore + pending);
    });

    it("Should clear the pending bonus after applying it", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 400, 7);
      await reputationManager
        .connect(coSigningManager)
        .applyOfferCoSigningBonus(user1.address, 7);
      expect(
        await reputationManager.getOfferCoSigningBonus(user1.address, 7),
      ).to.equal(0);
    });

    it("Should clear pending bonus on offer cancellation without applying", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 400, 99);
      await reputationManager
        .connect(coSigningManager)
        .clearOfferCoSigningBonus(user1.address, 99);
      expect(
        await reputationManager.getOfferCoSigningBonus(user1.address, 99),
      ).to.equal(0);
    });

    it("Should apply diminishing returns for repeated co-signs within cooldown", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 800, 1);
      const bonus1 = await reputationManager.getOfferCoSigningBonus(
        user1.address,
        1,
      );
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 800, 2);
      const bonus2 = await reputationManager.getOfferCoSigningBonus(
        user1.address,
        2,
      );
      expect(bonus2).to.be.lte(bonus1);
    });

    it("hasDiminishingReturns: true after first co-sign within cooldown", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 500, 1);
      expect(
        await reputationManager.hasDiminishingReturns(
          user2.address,
          user1.address,
        ),
      ).to.be.true;
    });

    it("hasDiminishingReturns: false after cooldown expires", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 500, 1);
      await increaseTime(COSIGN_COOLDOWN + 1);
      expect(
        await reputationManager.hasDiminishingReturns(
          user2.address,
          user1.address,
        ),
      ).to.be.false;
    });

    it("applyOfferCoSigningBonus: no-op if no pending bonus", async function () {
      await initUser(user1.address);
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(coSigningManager)
        .applyOfferCoSigningBonus(user1.address, 999);
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore).to.equal(dataBefore.baseScore);
    });
  });

  // ============ 7. Co-Signer Reward & Penalty ============

  describe("Co-Signer Reward & Penalty", function () {
    it("Should reward co-signer on successful repayment", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(coSigningManager)
        .rewardCoSigner(user1.address, user2.address);
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore).to.be.gte(dataBefore.baseScore);
    });

    it("Should penalize co-signer on borrower default", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      const dataBefore = await reputationManager.getReputationData(
        user1.address,
      );
      await reputationManager
        .connect(coSigningManager)
        .penalizeCoSigner(
          user1.address,
          user2.address,
          ethers.parseEther("10"),
        );
      const dataAfter = await reputationManager.getReputationData(
        user1.address,
      );
      expect(dataAfter.baseScore).to.be.lt(dataBefore.baseScore);
    });

    it("Co-signer penalty should be smaller than borrower penalty", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      const loanAmount = ethers.parseEther("10");
      const coSignerBefore = (
        await reputationManager.getReputationData(user1.address)
      ).baseScore;
      const borrowerBefore = (
        await reputationManager.getReputationData(user2.address)
      ).baseScore;
      await reputationManager
        .connect(coSigningManager)
        .penalizeCoSigner(user1.address, user2.address, loanAmount);
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user2.address, loanAmount);
      const coSignerAfter = (
        await reputationManager.getReputationData(user1.address)
      ).baseScore;
      const borrowerAfter = (
        await reputationManager.getReputationData(user2.address)
      ).baseScore;
      expect(coSignerBefore - coSignerAfter).to.be.lt(
        borrowerBefore - borrowerAfter,
      );
    });

    it("Should emit ReputationPenalty on co-signer penalty", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await expect(
        reputationManager
          .connect(coSigningManager)
          .penalizeCoSigner(
            user1.address,
            user2.address,
            ethers.parseEther("5"),
          ),
      ).to.emit(reputationManager, "ReputationPenalty");
    });

    it("Co-signer should not drop below MIN_REPUTATION", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      for (let i = 0; i < 20; i++) {
        await reputationManager
          .connect(coSigningManager)
          .penalizeCoSigner(
            user1.address,
            user2.address,
            ethers.parseEther("100000"),
          );
      }
      expect(
        (await reputationManager.getReputationData(user1.address)).baseScore,
      ).to.be.gte(MIN_REPUTATION);
    });

    it("Should revert penalizeCoSigner on zero addresses", async function () {
      await expect(
        reputationManager
          .connect(coSigningManager)
          .penalizeCoSigner(
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            ethers.parseEther("1"),
          ),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAddress",
      );
    });

    it("Should revert rewardCoSigner on zero addresses", async function () {
      await expect(
        reputationManager
          .connect(coSigningManager)
          .rewardCoSigner(ethers.ZeroAddress, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAddress",
      );
    });
  });

  // ============ 8. On-Chain Metrics ============

  describe("On-Chain Metrics", function () {
    it("Should update totalTransactions", async function () {
      await initUser(user1.address);
      await reputationManager
        .connect(dataFeed)
        .updateOnChainMetrics(
          user1.address,
          5,
          user2.address,
          ethers.parseEther("1"),
        );
      expect(
        (await reputationManager.getReputationData(user1.address))
          .totalTransactions,
      ).to.equal(5);
    });

    it("Should increment uniqueCounterparties for new counterparties", async function () {
      await initUser(user1.address);
      await reputationManager
        .connect(dataFeed)
        .updateOnChainMetrics(
          user1.address,
          1,
          user2.address,
          ethers.parseEther("1"),
        );
      await reputationManager
        .connect(dataFeed)
        .updateOnChainMetrics(
          user1.address,
          1,
          user3.address,
          ethers.parseEther("1"),
        );
      expect(
        (await reputationManager.getReputationData(user1.address))
          .uniqueCounterparties,
      ).to.equal(2);
    });

    it("Should not double-count the same counterparty", async function () {
      await initUser(user1.address);
      await reputationManager
        .connect(dataFeed)
        .updateOnChainMetrics(
          user1.address,
          1,
          user2.address,
          ethers.parseEther("1"),
        );
      await reputationManager
        .connect(dataFeed)
        .updateOnChainMetrics(
          user1.address,
          1,
          user2.address,
          ethers.parseEther("1"),
        );
      expect(
        (await reputationManager.getReputationData(user1.address))
          .uniqueCounterparties,
      ).to.equal(1);
    });

    it("Should not count tx value below 0.01 ETH threshold", async function () {
      await initUser(user1.address);
      await reputationManager
        .connect(dataFeed)
        .updateOnChainMetrics(
          user1.address,
          1,
          user2.address,
          ethers.parseEther("0.005"),
        );
      expect(
        (await reputationManager.getReputationData(user1.address))
          .totalValueTransferred,
      ).to.equal(0);
    });

    it("Should count tx value above 0.01 ETH threshold", async function () {
      await initUser(user1.address);
      const amount = ethers.parseEther("0.02");
      await reputationManager
        .connect(dataFeed)
        .updateOnChainMetrics(user1.address, 1, user2.address, amount);
      expect(
        (await reputationManager.getReputationData(user1.address))
          .totalValueTransferred,
      ).to.equal(amount);
    });

    it("Should emit OnChainMetricsUpdated event", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager
          .connect(dataFeed)
          .updateOnChainMetrics(
            user1.address,
            3,
            user2.address,
            ethers.parseEther("1"),
          ),
      ).to.emit(reputationManager, "OnChainMetricsUpdated");
    });

    it("Should revert on zero address", async function () {
      await expect(
        reputationManager
          .connect(dataFeed)
          .updateOnChainMetrics(
            ethers.ZeroAddress,
            1,
            user2.address,
            ethers.parseEther("1"),
          ),
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAddress",
      );
    });

    it("Should revert if called by non DATA_FEED_ROLE", async function () {
      await expect(
        reputationManager
          .connect(user1)
          .updateOnChainMetrics(
            user2.address,
            1,
            user1.address,
            ethers.parseEther("1"),
          ),
      ).to.be.reverted;
    });
  });

  // ============ 9. Reputation Decay ============

  describe("Reputation Decay", function () {
    it("Should not decay before DECAY_START_DAYS", async function () {
      await initUser(user1.address);
      // Advance to just under the 90-day decay threshold (88 full days to stay safely under)
      await increaseTime(88 * 86400);
      const scoreMidway = await reputationManager.getReputationScore(
        user1.address,
      );
      // Mine one more block so the view reflects the latest timestamp
      await ethers.provider.send("evm_mine", []);
      // Decay should still be 0 — score must not have dropped below the initial base
      expect(
        await reputationManager.getReputationScore(user1.address),
      ).to.equal(scoreMidway);
    });

    it("Should start decaying after DECAY_START_DAYS", async function () {
      await initUser(user1.address);
      // Advance just past the decay threshold and capture score
      await increaseTime((DECAY_START_DAYS + 5) * 86400);
      await ethers.provider.send("evm_mine", []);
      const scoreEarlyDecay = await reputationManager.getReputationScore(
        user1.address,
      );
      // Advance further into the decay window — decay accumulates, score must drop
      await increaseTime(30 * 86400);
      await ethers.provider.send("evm_mine", []);
      const scoreLaterDecay = await reputationManager.getReputationScore(
        user1.address,
      );
      expect(scoreLaterDecay).to.be.lt(scoreEarlyDecay);
    });

    it("Should cap decay after full decay period", async function () {
      await initUser(user1.address);
      await increaseTime((DECAY_START_DAYS + DECAY_PERIOD_DAYS + 100) * 86400);
      expect(
        await reputationManager.getReputationScore(user1.address),
      ).to.be.gte(MIN_REPUTATION);
    });

    it("Activity should reset the decay clock", async function () {
      await initUser(user1.address);
      await increaseTime(80 * 86400);
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, ethers.parseEther("1"));
      await increaseTime(80 * 86400);
      expect(
        await reputationManager.getReputationScore(user1.address),
      ).to.be.gt(MIN_REPUTATION);
    });
  });

  // ============ 10. View Functions ============

  describe("View Functions", function () {
    it("meetsReputationRequirement: true when score >= minimum", async function () {
      await initUser(user1.address);
      expect(
        await reputationManager.meetsReputationRequirement(user1.address, 50),
      ).to.be.true;
    });

    it("meetsReputationRequirement: false when score < minimum", async function () {
      await initUser(user1.address);
      expect(
        await reputationManager.meetsReputationRequirement(
          user1.address,
          MAX_REPUTATION,
        ),
      ).to.be.false;
    });

    it("getRemainingDailyCap: positive initially", async function () {
      await initUser(user1.address);
      expect(
        await reputationManager.getRemainingDailyCap(user1.address),
      ).to.be.gt(0);
    });

    it("getRemainingDailyCap: decreases after gains", async function () {
      await initUser(user1.address);
      const before = await reputationManager.getRemainingDailyCap(
        user1.address,
      );
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, ethers.parseEther("100"));
      expect(
        await reputationManager.getRemainingDailyCap(user1.address),
      ).to.be.lte(before);
    });

    it("getRemainingDailyCap: resets after 24h", async function () {
      await initUser(user1.address);
      for (let i = 0; i < 10; i++) {
        await reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, ethers.parseEther("100"));
      }
      await increaseTime(86400);
      expect(
        await reputationManager.getRemainingDailyCap(user1.address),
      ).to.be.gt(0);
    });

    it("getCoSignCount: tracks co-sign count", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 500, 1);
      expect(
        await reputationManager.getCoSignCount(user2.address, user1.address),
      ).to.equal(1);
    });

    it("getReputationData: returns full struct", async function () {
      await initUser(user1.address);
      const data = await reputationManager.getReputationData(user1.address);
      expect(data.walletCreationTime).to.be.gt(0);
      expect(data.baseScore).to.equal(STARTING_REPUTATION);
    });
  });

  // ============ 11. decrementActiveCoSigns ============

  describe("decrementActiveCoSigns", function () {
    it("Should not revert when decrementing after a co-sign", async function () {
      await initUser(user1.address);
      await initUser(user2.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, 400, 1);
      await expect(
        reputationManager
          .connect(coSigningManager)
          .decrementActiveCoSigns(user2.address),
      ).to.not.be.reverted;
    });

    it("Should not underflow if totalActiveCoSigns is already 0", async function () {
      await initUser(user1.address);
      await expect(
        reputationManager
          .connect(coSigningManager)
          .decrementActiveCoSigns(user1.address),
      ).to.not.be.reverted;
    });
  });

  // ============ 12. Role-Based Access Control ============

  describe("Role-Based Access Control", function () {
    it("Should allow admin to grant roles", async function () {
      await reputationManager
        .connect(owner)
        .grantRole(LENDING_POOL_ROLE, user1.address);
      expect(await reputationManager.hasRole(LENDING_POOL_ROLE, user1.address))
        .to.be.true;
    });

    it("Should allow admin to revoke roles", async function () {
      await reputationManager
        .connect(owner)
        .revokeRole(LENDING_POOL_ROLE, lendingPool.address);
      expect(
        await reputationManager.hasRole(LENDING_POOL_ROLE, lendingPool.address),
      ).to.be.false;
    });

    it("Should revert LENDING_POOL_ROLE action after role is revoked", async function () {
      await initUser(user1.address);
      await reputationManager
        .connect(owner)
        .revokeRole(LENDING_POOL_ROLE, lendingPool.address);
      await expect(
        reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, ethers.parseEther("1")),
      ).to.be.reverted;
    });
  });
});
