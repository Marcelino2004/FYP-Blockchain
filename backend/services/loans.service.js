const blockchainService = require("./blockchain.service");

class LoansService {
  async getActiveLenderOffers() {
    const contract = blockchainService.getContract("lendingPool");
    const offerIds = await contract.getActiveLenderOfferIds();

    const offers = await Promise.all(
      offerIds.map(async (id) => {
        const offer = await contract.getLoanOffer(id);
        return this.formatOffer(offer, id);
      })
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
      })
    );

    return requests;
  }

  async getUserLoans(address) {
    const contract = blockchainService.getContract("lendingPool");
    const loanIds = await contract.getUserLoans(address);

    const loans = await Promise.all(
      loanIds.map(async (id) => {
        const loan = await contract.getLoan(id);
        const amountDue = await contract.calculateAmountDue(id);
        const isOverdue = await contract.isLoanOverdue(id);

        return this.formatLoan(loan, id, amountDue, isOverdue);
      })
    );

    return loans;
  }

  async getLoanDetails(loanId) {
    const contract = blockchainService.getContract("lendingPool");
    const loan = await contract.getLoan(loanId);
    const amountDue = await contract.calculateAmountDue(loanId);
    const isOverdue = await contract.isLoanOverdue(loanId);

    return this.formatLoan(loan, loanId, amountDue, isOverdue);
  }

  formatOffer(offer, offerId) {
    return {
      offerId: offerId.toString(),
      creator: offer.creator,
      offerType: offer.offerType === 0n ? "LENDER_OFFER" : "BORROW_REQUEST",
      terms: {
        tokenAddress: offer.terms.tokenAddress,
        principalAmount: blockchainService.formatEther(
          offer.terms.principalAmount
        ),
        collateralAmount: blockchainService.formatEther(
          offer.terms.collateralAmount
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

  formatLoan(loan, loanId, amountDue, isOverdue) {
    const statusNames = [
      "PENDING",
      "ACTIVE",
      "REPAID",
      "DEFAULTED",
      "CANCELLED",
    ];

    return {
      loanId: loanId.toString(),
      lender: loan.lender,
      borrower: loan.borrower,
      status: statusNames[loan.status],
      terms: {
        tokenAddress: loan.terms.tokenAddress,
        principalAmount: blockchainService.formatEther(
          loan.terms.principalAmount
        ),
        collateralAmount: blockchainService.formatEther(
          loan.terms.collateralAmount
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
        amountDue - loan.amountRepaid
      ),
      isOverdue,
      collateralDepositId: loan.collateralDepositId.toString(),
      hasCoSigner: loan.hasCoSigner,
      coSigner: loan.coSigner,
    };
  }

  async getPlatformStats() {
    const contract = blockchainService.getContract("lendingPool");

    const totalLoans = await contract.nextLoanId();
    const totalOffers = await contract.nextOfferId();
    const activeLenderOffers = await contract.getActiveLenderOfferIds();
    const activeBorrowerRequests = await contract.getActiveBorrowerRequestIds();
    const platformFeeRate = await contract.platformFeeRate();

    return {
      totalLoans: (Number(totalLoans) - 1).toString(),
      totalOffers: (Number(totalOffers) - 1).toString(),
      activeLenderOffers: activeLenderOffers.length,
      activeBorrowerRequests: activeBorrowerRequests.length,
      platformFeeRate: (Number(platformFeeRate) / 100).toFixed(2) + "%",
    };
  }
}

module.exports = new LoansService();
