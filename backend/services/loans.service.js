const blockchainService = require("./blockchain.service");

class LoansService {
  async getActiveLenderOffers() {
    const contract = blockchainService.getContract("lendingPool");
    const offerIds = await contract.getActiveLenderOfferIds();

    const offers = await Promise.all(
      offerIds.map(async (id) => {
        const offer = await contract.getLoanOffer(id);
        return this.formatOffer(offer, id);
      }),
    );

    return offers;
  }

  async getActiveBorrowerRequests() {
    const contract = blockchainService.getContract("lendingPool");
    const requestIds = await contract.getActiveBorrowerRequestIds();

    const requests = await Promise.all(
      requestIds.map(async (id) => {
        const offer = await contract.getLoanOffer(id);
        return this.formatOffer(offer, id);
      }),
    );

    return requests;
  }

  async getUserLoans(address) {
    const contract = blockchainService.getContract("lendingPool");
    const loanIds = await contract.getUserLoans(address);

    const loans = await Promise.all(
      loanIds.map(async (id) => {
        const loan = await contract.getLoan(id);
        const amountDue = await this.calculateAmountDue(loan);
        const isOverdue = await contract.isLoanOverdue(id);

        return this.formatLoan(loan, id, amountDue, isOverdue);
      }),
    );

    return loans;
  }

  async getLoanDetails(loanId) {
    const contract = blockchainService.getContract("lendingPool");
    const loan = await contract.getLoan(loanId);
    const amountDue = await this.calculateAmountDue(loan);
    const isOverdue = await contract.isLoanOverdue(loanId);

    return this.formatLoan(loan, loanId, amountDue, isOverdue);
  }

  // ✅ Helper to calculate amount due
  calculateAmountDue(loan) {
    const principal = loan.terms.principalAmount;
    const interestRate = loan.terms.interestRate;
    const BASIS_POINTS = 10000n;

    const interest = (principal * interestRate) / BASIS_POINTS;
    return principal + interest;
  }

  formatOffer(offer, offerId) {
    return {
      offerId: offerId.toString(),
      creator: offer.creator,
      offerType: offer.offerType === 0n ? "LENDER_OFFER" : "BORROW_REQUEST",
      terms: {
        tokenAddress: offer.terms.tokenAddress,
        principalAmount: blockchainService.formatEther(
          offer.terms.principalAmount,
        ),
        collateralAmount: blockchainService.formatEther(
          offer.terms.collateralAmount,
        ),
        collateralToken: offer.terms.collateralToken,
        interestRate: (Number(offer.terms.interestRate) / 100).toFixed(2) + "%",
        duration: Number(offer.terms.duration) / 86400 + " days",
        minReputation: offer.terms.minReputation.toString(),
        collateralRatio:
          (Number(offer.terms.collateralRatio) / 100).toFixed(2) + "%",
      },
      isActive: offer.isActive,
      createdAt: new Date(Number(offer.createdAt) * 1000).toISOString(),
    };
  }

  async formatLoan(loan, loanId, amountDue, isOverdue) {
    const statusNames = [
      "PENDING",
      "ACTIVE",
      "REPAID",
      "DEFAULTED",
      "CANCELLED",
    ];

    // ─────────────────────────────────────────────────────────────────────
    // collateralDepositId resolution
    //
    // For BORROW_REQUEST loans the collateral is deposited by the borrower
    // before the loan is matched.  The LendingPool stores the depositId that
    // was passed into acceptLoanOffer() on the Loan struct.  In some cases
    // (older loans, or a lender that mistakenly passed 0) this field is 0
    // even though collateral was locked.
    //
    // Fallback: query CollateralManager.getLoanCollateral(loanId) which uses
    // the loanToDepositIds mapping populated by lockCollateral().  If that
    // returns a deposit, use its depositId instead.
    // ─────────────────────────────────────────────────────────────────────
    let resolvedDepositId = loan.collateralDepositId.toString();

    const hasCollateral = loan.terms.collateralAmount > 0n;
    const depositIdIsZero = loan.collateralDepositId === 0n;

    if (hasCollateral && depositIdIsZero) {
      try {
        const collateralContract =
          blockchainService.getContract("collateralManager");
        const deposits = await collateralContract.getLoanCollateral(loanId);

        if (deposits && deposits.length > 0) {
          resolvedDepositId = deposits[0].depositId.toString();
          console.log(
            `[loans.service] loan#${loanId} resolved depositId via getLoanCollateral: ${resolvedDepositId}`,
          );
        } else {
          console.warn(
            `[loans.service] loan#${loanId} getLoanCollateral returned 0 deposits — depositId stays "0"`,
          );
        }
      } catch (err) {
        console.warn(
          `[loans.service] loan#${loanId} getLoanCollateral threw:`,
          err.message,
        );
      }
    }

    console.log(
      `[loans.service] loan#${loanId} ` +
        `status=${statusNames[loan.status]} ` +
        `collateralAmount=${loan.terms.collateralAmount} ` +
        `collateralDepositId(raw)=${loan.collateralDepositId} ` +
        `collateralDepositId(resolved)=${resolvedDepositId}`,
    );

    return {
      loanId: loanId.toString(),
      lender: loan.lender,
      borrower: loan.borrower,
      status: statusNames[loan.status],
      terms: {
        tokenAddress: loan.terms.tokenAddress,
        principalAmount: blockchainService.formatEther(
          loan.terms.principalAmount,
        ),
        collateralAmount: blockchainService.formatEther(
          loan.terms.collateralAmount,
        ),
        collateralToken: loan.terms.collateralToken,
        interestRate: (Number(loan.terms.interestRate) / 100).toFixed(2) + "%",
        duration: Number(loan.terms.duration) / 86400 + " days",
        minReputation: loan.terms.minReputation.toString(),
        collateralRatio:
          (Number(loan.terms.collateralRatio) / 100).toFixed(2) + "%",
      },
      startTime: new Date(Number(loan.startTime) * 1000).toISOString(),
      dueTime: new Date(Number(loan.dueTime) * 1000).toISOString(),
      amountRepaid: blockchainService.formatEther(loan.amountRepaid),
      amountDue: blockchainService.formatEther(amountDue),
      remainingAmount: blockchainService.formatEther(
        amountDue - loan.amountRepaid,
      ),
      isOverdue,
      collateralDepositId: resolvedDepositId,
      hasCoSigner: loan.hasCoSigner,
      coSigner: loan.coSigner,
    };
  }

  // ✅ FIXED: Handle the 5 return values correctly
  async getPlatformStats() {
    try {
      const lens = blockchainService.getContract("lendingPoolLens");

      // getPlatformStats returns 5 values as an object
      const result = await lens.getPlatformStats();

      console.log("Platform stats result:", result);

      return {
        totalLoans: result[0].toString(),
        totalOffers: result[1].toString(),
        activeLenderOffers: Number(result[2]),
        activeBorrowerRequests: Number(result[3]),
        platformFeeRate: (Number(result[4]) / 100).toFixed(2) + "%",
      };
    } catch (error) {
      console.error("Error getting platform stats:", error);
      // Return default values if there's an error
      return {
        totalLoans: "0",
        totalOffers: "0",
        activeLenderOffers: 0,
        activeBorrowerRequests: 0,
        platformFeeRate: "1.00%",
      };
    }
  }
}

module.exports = new LoansService();
