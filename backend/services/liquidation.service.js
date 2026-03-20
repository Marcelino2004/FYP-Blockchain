const blockchainService = require("./blockchain.service");
const { ethers } = require("ethers");

const POLL_INTERVAL_MS = 30_000; // check every 30 seconds

class LiquidationService {
  constructor() {
    this.running = false;
    this.intervalId = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log("⚡ Liquidation monitor started (interval: 30s)");
    this.intervalId = setInterval(
      () => this.scanAndLiquidate(),
      POLL_INTERVAL_MS,
    );
    // Also run immediately on start
    this.scanAndLiquidate();
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.running = false;
    console.log("🛑 Liquidation monitor stopped");
  }

  async scanAndLiquidate() {
    try {
      const lendingPool = blockchainService.getContract("lendingPool");
      const collateralManager =
        blockchainService.getContract("collateralManager");

      // Get total loan count
      const nextLoanId = await lendingPool.getNextLoanId();
      const totalLoans = Number(nextLoanId) - 1;

      if (totalLoans === 0) return;

      console.log(`🔍 Scanning ${totalLoans} loan(s) for liquidation...`);

      for (let loanId = 1; loanId <= totalLoans; loanId++) {
        try {
          await this.checkAndLiquidate(loanId, lendingPool, collateralManager);
        } catch (err) {
          console.warn(
            `[liquidation] loan#${loanId} check failed:`,
            err.message,
            err.stack,
          );
        }
      }
    } catch (err) {
      console.error("[liquidation] scanAndLiquidate error:", err.message);
    }
  }

  async checkAndLiquidate(loanId, lendingPool, collateralManager) {
    const loan = await lendingPool.getLoan(loanId);

    // Only care about active loans
    if (loan.status !== 1n) return;

    // Skip loans with no collateral
    if (loan.collateralDepositId === 0n) return;

    console.log(
      `[loan#${loanId}] collateralDepositId: ${loan.collateralDepositId}, status: ${loan.status}`,
    );

    const amountDue = this._calculateAmountDue(loan);
    const unpaidAmount = amountDue - loan.amountRepaid;

    console.log(
      `[loan#${loanId}] amountDue: ${amountDue}, unpaidAmount: ${unpaidAmount}`,
    );

    console.log(`[loan#${loanId}] lender: ${loan.lender}`);
    console.log(`[loan#${loanId}] borrower: ${loan.borrower}`);
    console.log(
      `[loan#${loanId}] backend signer: ${await lendingPool.runner.getAddress()}`,
    );

    if (unpaidAmount === 0n) return;

    const unpaidAmountUSD = await collateralManager.getTokenUSDValue(
      loan.terms.tokenAddress,
      unpaidAmount,
    );

    console.log(`[loan#${loanId}] unpaidAmountUSD: ${unpaidAmountUSD}`);

    const collateralValueUSD =
      await collateralManager.getLoanCollateralValue(loanId);
    console.log(`[loan#${loanId}] collateralValueUSD: ${collateralValueUSD}`);

    const liquidatable = await collateralManager.canLiquidate(
      loanId,
      unpaidAmountUSD,
    );

    console.log(`[loan#${loanId}] liquidatable: ${liquidatable}`);

    if (!liquidatable) return;

    console.log(
      `⚡ loan#${loanId} is undercollateralized — triggering liquidation`,
    );

    const tx = await lendingPool.liquidateLoan(loanId);
    await tx.wait();

    console.log(`✅ loan#${loanId} liquidated (tx: ${tx.hash})`);
  }

  _calculateAmountDue(loan) {
    const principal = loan.terms.principalAmount;
    const interestRate = loan.terms.interestRate;
    const BASIS_POINTS = 10000n;
    return principal + (principal * interestRate) / BASIS_POINTS;
  }
}

module.exports = new LiquidationService();
