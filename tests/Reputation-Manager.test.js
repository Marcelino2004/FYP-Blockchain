const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");

describe("ReputationManager", function () {
  // ============ Test Fixtures ============

  async function deployReputationManagerFixture() {
    const [
      owner,
      lendingPool,
      coSigningManager,
      verifier,
      user1,
      user2,
      user3,
      user4,
    ] = await ethers.getSigners();

    const ReputationManager =
      await ethers.getContractFactory("ReputationManager");
    const reputationManager = await ReputationManager.deploy();

    // Grant roles
    const LENDING_POOL_ROLE = await reputationManager.LENDING_POOL_ROLE();
    const COSIGNING_ROLE = await reputationManager.COSIGNING_ROLE();
    const VERIFIER_ROLE = await reputationManager.VERIFIER_ROLE();

    await reputationManager.grantRole(LENDING_POOL_ROLE, lendingPool.address);
    await reputationManager.grantRole(COSIGNING_ROLE, coSigningManager.address);
    await reputationManager.grantRole(VERIFIER_ROLE, verifier.address);

    return {
      reputationManager,
      owner,
      lendingPool,
      coSigningManager,
      verifier,
      user1,
      user2,
      user3,
      user4,
      LENDING_POOL_ROLE,
      COSIGNING_ROLE,
      VERIFIER_ROLE,
    };
  }

  // ============ Test Suite 1: Deployment & Initialization ============

  describe("Deployment & Initialization", function () {
    it("Should deploy with correct initial values", async function () {
      const { reputationManager } = await loadFixture(
        deployReputationManagerFixture
      );

      expect(await reputationManager.MIN_REPUTATION()).to.equal(0);
      expect(await reputationManager.MAX_REPUTATION()).to.equal(1000);
      expect(await reputationManager.STARTING_REPUTATION()).to.equal(100);
    });

    it("Should grant admin role to deployer", async function () {
      const { reputationManager, owner } = await loadFixture(
        deployReputationManagerFixture
      );

      const DEFAULT_ADMIN_ROLE = await reputationManager.DEFAULT_ADMIN_ROLE();
      expect(await reputationManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address))
        .to.be.true;
    });

    it("Should initialize user with starting reputation", async function () {
      const { reputationManager, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);

      const score = await reputationManager.getReputationScore(user1.address);
      expect(score).to.be.closeTo(100, 5); // Allow small variance due to calculations
    });

    it("Should return 0 reputation for non-initialized users", async function () {
      const { reputationManager, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      const score = await reputationManager.getReputationScore(user1.address);
      expect(score).to.equal(0);
    });

    it("Should not re-initialize already initialized user", async function () {
      const { reputationManager, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const firstScore = await reputationManager.getReputationScore(
        user1.address
      );

      // Try to initialize again
      await reputationManager.initializeReputation(user1.address);
      const secondScore = await reputationManager.getReputationScore(
        user1.address
      );

      expect(firstScore).to.equal(secondScore);
    });

    it("Should revert on zero address initialization", async function () {
      const { reputationManager } = await loadFixture(
        deployReputationManagerFixture
      );

      await expect(
        reputationManager.initializeReputation(ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAddress"
      );
    });
  });

  // ============ Test Suite 2: Successful Repayments ============

  describe("Successful Repayments", function () {
    it("Should increase reputation on successful repayment", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const scoreBefore = await reputationManager.getReputationScore(
        user1.address
      );

      const loanAmount = ethers.utils.parseEther("1000");
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, loanAmount);

      const scoreAfter = await reputationManager.getReputationScore(
        user1.address
      );
      expect(scoreAfter).to.be.gt(scoreBefore);
    });

    it("Should give larger bonus for larger loan amounts", async function () {
      const { reputationManager, lendingPool, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      await reputationManager.initializeReputation(user1.address);
      await reputationManager.initializeReputation(user2.address);

      const smallLoan = ethers.utils.parseEther("100");
      const largeLoan = ethers.utils.parseEther("10000");

      const user1Before = await reputationManager.getReputationScore(
        user1.address
      );
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, smallLoan);
      const user1After = await reputationManager.getReputationScore(
        user1.address
      );

      const user2Before = await reputationManager.getReputationScore(
        user2.address
      );
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user2.address, largeLoan);
      const user2After = await reputationManager.getReputationScore(
        user2.address
      );

      const user1Gain = user1After - user1Before;
      const user2Gain = user2After - user2Before;

      expect(user2Gain).to.be.gt(user1Gain);
    });

    it("Should update repayment history correctly", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);

      const loanAmount = ethers.utils.parseEther("1000");
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, loanAmount);

      const data = await reputationManager.getReputationData(user1.address);
      expect(data.successfulRepayments).to.equal(1);
      expect(data.totalRepaymentValue).to.equal(loanAmount);
    });

    it("Should emit ReputationUpdated event on repayment", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const loanAmount = ethers.utils.parseEther("1000");

      await expect(
        reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, loanAmount)
      )
        .to.emit(reputationManager, "ReputationUpdated")
        .withArgs(
          user1.address,
          await reputationManager.getReputationScore(user1.address),
          await reputationManager.getReputationScore(user1.address),
          "Successful repayment"
        );
    });

    it("Should respect daily reputation gain cap", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);

      const largeLoan = ethers.utils.parseEther("100000"); // Very large loan

      // First repayment
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, largeLoan);
      const scoreAfterFirst = await reputationManager.getReputationScore(
        user1.address
      );

      // Second repayment (should hit cap)
      await reputationManager
        .connect(lendingPool)
        .recordSuccessfulRepayment(user1.address, largeLoan);
      const scoreAfterSecond = await reputationManager.getReputationScore(
        user1.address
      );

      // The gain should be limited
      const maxGain = 50; // MAX_REPUTATION_GAIN_PER_PERIOD
      expect(scoreAfterSecond - 100).to.be.lte(maxGain); // Starting from 100
    });

    it("Should only allow LENDING_POOL_ROLE to record repayments", async function () {
      const { reputationManager, user1, user2 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const loanAmount = ethers.utils.parseEther("1000");

      await expect(
        reputationManager
          .connect(user2)
          .recordSuccessfulRepayment(user1.address, loanAmount)
      ).to.be.reverted;
    });

    it("Should revert on zero loan amount", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);

      await expect(
        reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, 0)
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__InvalidAmount"
      );
    });

    it("Should not exceed MAX_REPUTATION", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const largeLoan = ethers.utils.parseEther("10000");

      // Make many successful repayments
      for (let i = 0; i < 30; i++) {
        await reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, largeLoan);
        // Advance time to reset daily cap
        await time.increase(86400); // 1 day
      }

      const finalScore = await reputationManager.getReputationScore(
        user1.address
      );
      expect(finalScore).to.be.lte(1000);
    });
  });

  // ============ Test Suite 3: Defaults & Penalties ============

  describe("Defaults & Penalties", function () {
    it("Should decrease reputation on default", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const scoreBefore = await reputationManager.getReputationScore(
        user1.address
      );

      const loanAmount = ethers.utils.parseEther("1000");
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, loanAmount);

      const scoreAfter = await reputationManager.getReputationScore(
        user1.address
      );
      expect(scoreAfter).to.be.lt(scoreBefore);
    });

    it("Should apply severe penalty for defaults", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const scoreBefore = await reputationManager.getReputationScore(
        user1.address
      );

      const loanAmount = ethers.utils.parseEther("1000");
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, loanAmount);

      const scoreAfter = await reputationManager.getReputationScore(
        user1.address
      );
      const penalty = scoreBefore - scoreAfter;

      // Penalty should be at least 100 (DEFAULT_PENALTY_BASE)
      expect(penalty).to.be.gte(100);
    });

    it("Should update default history correctly", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);

      const loanAmount = ethers.utils.parseEther("1000");
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, loanAmount);

      const data = await reputationManager.getReputationData(user1.address);
      expect(data.defaults).to.equal(1);
      expect(data.totalDefaultValue).to.equal(loanAmount);
    });

    it("Should emit ReputationPenalty and ReputationUpdated events", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const loanAmount = ethers.utils.parseEther("1000");

      await expect(
        reputationManager
          .connect(lendingPool)
          .recordDefault(user1.address, loanAmount)
      ).to.emit(reputationManager, "ReputationPenalty");
    });

    it("Should not drop below MIN_REPUTATION", async function () {
      const { reputationManager, lendingPool, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);

      const largeLoan = ethers.utils.parseEther("100000");
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, largeLoan);

      const finalScore = await reputationManager.getReputationScore(
        user1.address
      );
      expect(finalScore).to.be.gte(0);
    });

    it("Should reduce penalty for users with good repayment history", async function () {
      const { reputationManager, lendingPool, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      // User1: Good history
      await reputationManager.initializeReputation(user1.address);
      const loanAmount = ethers.utils.parseEther("1000");

      // Build good history
      for (let i = 0; i < 15; i++) {
        await reputationManager
          .connect(lendingPool)
          .recordSuccessfulRepayment(user1.address, loanAmount);
        await time.increase(86400);
      }

      const user1Before = await reputationManager.getReputationScore(
        user1.address
      );
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, loanAmount);
      const user1After = await reputationManager.getReputationScore(
        user1.address
      );
      const user1Penalty = user1Before - user1After;

      // User2: No history
      await reputationManager.initializeReputation(user2.address);
      const user2Before = await reputationManager.getReputationScore(
        user2.address
      );
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user2.address, loanAmount);
      const user2After = await reputationManager.getReputationScore(
        user2.address
      );
      const user2Penalty = user2Before - user2After;

      // User1 should have smaller penalty due to good history
      expect(user1Penalty).to.be.lt(user2Penalty);
    });
  });

  // ============ Test Suite 4: Off-Chain Verification ============

  describe("Off-Chain Verification", function () {
    it("Should add email verification bonus", async function () {
      const { reputationManager, verifier, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const scoreBefore = await reputationManager.getReputationScore(
        user1.address
      );

      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "email");

      const scoreAfter = await reputationManager.getReputationScore(
        user1.address
      );
      expect(scoreAfter).to.be.gt(scoreBefore);

      const data = await reputationManager.getReputationData(user1.address);
      expect(data.emailVerified).to.be.true;
    });

    it("Should add phone verification bonus", async function () {
      const { reputationManager, verifier, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      const scoreBefore = await reputationManager.getReputationScore(
        user1.address
      );

      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "phone");

      const scoreAfter = await reputationManager.getReputationScore(
        user1.address
      );
      expect(scoreAfter).to.be.gt(scoreBefore);

      const data = await reputationManager.getReputationData(user1.address);
      expect(data.phoneVerified).to.be.true;
    });

    it("Should give higher bonus for phone vs email", async function () {
      const { reputationManager, verifier, user1, user2 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      await reputationManager.initializeReputation(user2.address);

      const user1Before = await reputationManager.getReputationScore(
        user1.address
      );
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "email");
      const user1After = await reputationManager.getReputationScore(
        user1.address
      );
      const emailBonus = user1After - user1Before;

      const user2Before = await reputationManager.getReputationScore(
        user2.address
      );
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user2.address, "phone");
      const user2After = await reputationManager.getReputationScore(
        user2.address
      );
      const phoneBonus = user2After - user2Before;

      expect(phoneBonus).to.be.gt(emailBonus);
    });

    it("Should revert if already verified", async function () {
      const { reputationManager, verifier, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);
      await reputationManager
        .connect(verifier)
        .recordOffChainVerification(user1.address, "email");

      await expect(
        reputationManager
          .connect(verifier)
          .recordOffChainVerification(user1.address, "email")
      ).to.be.revertedWithCustomError(
        reputationManager,
        "ReputationManager__AlreadyVerified"
      );
    });

    it("Should only allow VERIFIER_ROLE to verify", async function () {
      const { reputationManager, user1, user2 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);

      await expect(
        reputationManager
          .connect(user2)
          .recordOffChainVerification(user1.address, "email")
      ).to.be.reverted;
    });

    it("Should emit OffChainVerification event", async function () {
      const { reputationManager, verifier, user1 } = await loadFixture(
        deployReputationManagerFixture
      );

      await reputationManager.initializeReputation(user1.address);

      await expect(
        reputationManager
          .connect(verifier)
          .recordOffChainVerification(user1.address, "email")
      )
        .to.emit(reputationManager, "OffChainVerification")
        .withArgs(user1.address, "email", 20);
    });
  });

  // ============ Test Suite 5: Co-Signing System ============

  describe("Co-Signing System", function () {
    it("Should add co-signing bonus", async function () {
      const { reputationManager, coSigningManager, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      await reputationManager.initializeReputation(user1.address); // Borrower
      await reputationManager.initializeReputation(user2.address); // Co-signer

      // Build co-signer reputation
      const loanAmount = ethers.utils.parseEther("1000");
      for (let i = 0; i < 10; i++) {
        await reputationManager
          .connect(coSigningManager)
          .recordSuccessfulRepayment(user2.address, loanAmount);
        await time.increase(86400);
      }

      const coSignerRep = await reputationManager.getReputationScore(
        user2.address
      );
      const borrowerBefore = await reputationManager.getReputationScore(
        user1.address
      );

      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, coSignerRep);

      const borrowerAfter = await reputationManager.getReputationScore(
        user1.address
      );
      expect(borrowerAfter).to.be.gt(borrowerBefore);
    });

    it("Should apply diminishing returns on repeated co-signing", async function () {
      const { reputationManager, coSigningManager, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      await reputationManager.initializeReputation(user1.address);
      await reputationManager.initializeReputation(user2.address);

      // Build co-signer reputation
      const loanAmount = ethers.utils.parseEther("1000");
      for (let i = 0; i < 10; i++) {
        await reputationManager
          .connect(coSigningManager)
          .recordSuccessfulRepayment(user2.address, loanAmount);
        await time.increase(86400);
      }

      const coSignerRep = await reputationManager.getReputationScore(
        user2.address
      );

      // First co-sign
      const before1 = await reputationManager.getReputationScore(user1.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, coSignerRep);
      const after1 = await reputationManager.getReputationScore(user1.address);
      const bonus1 = after1 - before1;

      // Second co-sign
      await time.increase(86400);
      const before2 = await reputationManager.getReputationScore(user1.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, coSignerRep);
      const after2 = await reputationManager.getReputationScore(user1.address);
      const bonus2 = after2 - before2;

      // Second bonus should be less (diminishing returns)
      expect(bonus2).to.be.lt(bonus1);
    });

    it("Should reset diminishing returns after cooldown", async function () {
      const { reputationManager, coSigningManager, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      await reputationManager.initializeReputation(user1.address);
      await reputationManager.initializeReputation(user2.address);

      // Build co-signer reputation
      const loanAmount = ethers.utils.parseEther("1000");
      for (let i = 0; i < 10; i++) {
        await reputationManager
          .connect(coSigningManager)
          .recordSuccessfulRepayment(user2.address, loanAmount);
        await time.increase(86400);
      }

      const coSignerRep = await reputationManager.getReputationScore(
        user2.address
      );

      // First co-sign
      const before1 = await reputationManager.getReputationScore(user1.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, coSignerRep);
      const after1 = await reputationManager.getReputationScore(user1.address);
      const bonus1 = after1 - before1;

      // Wait for cooldown (30 days)
      await time.increase(30 * 86400 + 1);

      // Co-sign again after cooldown
      const before3 = await reputationManager.getReputationScore(user1.address);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, coSignerRep);
      const after3 = await reputationManager.getReputationScore(user1.address);
      const bonus3 = after3 - before3;

      // Bonus should be similar to first (reset)
      expect(bonus3).to.be.closeTo(bonus1, 5);
    });

    it("Should reward co-signer on successful repayment", async function () {
      const { reputationManager, coSigningManager, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      await reputationManager.initializeReputation(user1.address);
      await reputationManager.initializeReputation(user2.address);

      const scoreBefore = await reputationManager.getReputationScore(
        user2.address
      );

      await reputationManager
        .connect(coSigningManager)
        .rewardCoSigner(user2.address, user1.address);

      const scoreAfter = await reputationManager.getReputationScore(
        user2.address
      );
      expect(scoreAfter).to.be.gt(scoreBefore);
    });

    it("Should penalize co-signer on default", async function () {
      const { reputationManager, coSigningManager, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      await reputationManager.initializeReputation(user1.address);
      await reputationManager.initializeReputation(user2.address);

      const scoreBefore = await reputationManager.getReputationScore(
        user2.address
      );

      const loanAmount = ethers.utils.parseEther("1000");
      await reputationManager
        .connect(coSigningManager)
        .penalizeCoSigner(user2.address, user1.address, loanAmount);

      const scoreAfter = await reputationManager.getReputationScore(
        user2.address
      );
      expect(scoreAfter).to.be.lt(scoreBefore);
    });

    it("Should apply smaller penalty to co-signer than borrower", async function () {
      const { reputationManager, lendingPool, coSigningManager, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      await reputationManager.initializeReputation(user1.address); // Borrower
      await reputationManager.initializeReputation(user2.address); // Co-signer

      const loanAmount = ethers.utils.parseEther("1000");

      // Apply penalties
      const borrowerBefore = await reputationManager.getReputationScore(
        user1.address
      );
      await reputationManager
        .connect(lendingPool)
        .recordDefault(user1.address, loanAmount);
      const borrowerAfter = await reputationManager.getReputationScore(
        user1.address
      );
      const borrowerPenalty = borrowerBefore - borrowerAfter;

      const coSignerBefore = await reputationManager.getReputationScore(
        user2.address
      );
      await reputationManager
        .connect(coSigningManager)
        .penalizeCoSigner(user2.address, user1.address, loanAmount);
      const coSignerAfter = await reputationManager.getReputationScore(
        user2.address
      );
      const coSignerPenalty = coSignerBefore - coSignerAfter;

      // Co-signer penalty should be less (30% of borrower)
      expect(coSignerPenalty).to.be.lt(borrowerPenalty);
    });

    it("Should track co-signing count correctly", async function () {
      const { reputationManager, coSigningManager, user1, user2 } =
        await loadFixture(deployReputationManagerFixture);

      await reputationManager.initializeReputation(user1.address);
      await reputationManager.initializeReputation(user2.address);

      // Build co-signer reputation first
      const loanAmount = ethers.utils.parseEther("1000");
      for (let i = 0; i < 5; i++) {
        await reputationManager
          .connect(coSigningManager)
          .recordSuccessfulRepayment(user2.address, loanAmount);
        await time.increase(86400);
      }

      const coSignerRep = await reputationManager.getReputationScore(
        user2.address
      );

      // Co-sign twice
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, coSignerRep);
      await time.increase(86400);
      await reputationManager
        .connect(coSigningManager)
        .addCoSigningBonus(user1.address, user2.address, coSignerRep);

      const count = await reputationManager.getCoSignCount(
        user2.address,
        user1.address
      );
      expect(count).to.equal(2);
    });
    /*
    it("Should check diminishing returns status correctly", async function () {
      const { reputationManager, coSigningManager, user1, user2 } = await loadFixture(deployReputationManagerFixture);
      
      await reputationManager.initializeReputation(user1.address);
      await reputationManager.initializeReputation(user2.address);
      
      // Build co-signer reputation
      const loanAmount = ethers.
*/
  });
});
