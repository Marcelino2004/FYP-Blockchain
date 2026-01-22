// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./LendingPool.sol";

contract LendingPoolLens {
    LendingPool public immutable pool;

    constructor(address lendingPool) {
        require(lendingPool != address(0), "ZERO_ADDRESS");
        pool = LendingPool(lendingPool);
    }

    // ============ PLATFORM STATS ============

    function getPlatformStats()
        external
        view
        returns (
            uint256 totalLoans,
            uint256 totalOffers,
            uint256 activeLenderOffers,
            uint256 activeBorrowerRequests,
            uint256 platformFeeRate
        )
    {
        // Get counters from LendingPool
        totalLoans = pool.getNextLoanId() - 1;
        totalOffers = pool.getNextOfferId() - 1;

        // Get active offer counts
        uint256[] memory lenderOfferIds = pool.getActiveLenderOfferIds();
        uint256[] memory borrowerRequestIds = pool
            .getActiveBorrowerRequestIds();

        activeLenderOffers = lenderOfferIds.length;
        activeBorrowerRequests = borrowerRequestIds.length;

        // Get platform fee rate
        platformFeeRate = pool.platformFeeRate();

        return (
            totalLoans,
            totalOffers,
            activeLenderOffers,
            activeBorrowerRequests,
            platformFeeRate
        );
    }

    // ============ ACTIVE OFFERS ============

    function getActiveLenderOffers() external view returns (uint256[] memory) {
        return pool.getActiveLenderOfferIds();
    }

    function getActiveBorrowerRequests()
        external
        view
        returns (uint256[] memory)
    {
        return pool.getActiveBorrowerRequestIds();
    }

    // ============ USER LOANS ============

    function getUserLoans(
        address user
    ) external view returns (uint256[] memory) {
        return pool.getUserLoans(user);
    }

    function getUserActiveLoans(
        address user
    ) external view returns (LendingPool.Loan[] memory) {
        uint256[] memory loanIds = pool.getUserLoans(user);
        uint256 activeCount = 0;

        for (uint256 i = 0; i < loanIds.length; i++) {
            LendingPool.Loan memory loan = pool.getLoan(loanIds[i]);
            if (loan.status == LendingPool.LoanStatus.ACTIVE) {
                activeCount++;
            }
        }

        LendingPool.Loan[] memory activeLoans = new LendingPool.Loan[](
            activeCount
        );

        uint256 index = 0;
        for (uint256 i = 0; i < loanIds.length; i++) {
            LendingPool.Loan memory loan = pool.getLoan(loanIds[i]);
            if (loan.status == LendingPool.LoanStatus.ACTIVE) {
                activeLoans[index] = loan;
                index++;
            }
        }

        return activeLoans;
    }

    // ============ HELPERS ============

    function getLoanAmountDue(uint256 loanId) external view returns (uint256) {
        LendingPool.Loan memory loan = pool.getLoan(loanId);

        if (
            loan.status == LendingPool.LoanStatus.PENDING ||
            loan.status == LendingPool.LoanStatus.CANCELLED
        ) {
            return 0;
        }

        return
            loan.terms.principalAmount +
            (loan.terms.principalAmount * loan.terms.interestRate) /
            pool.BASIS_POINTS();
    }
}
