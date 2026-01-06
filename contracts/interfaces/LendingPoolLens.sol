// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./LendingPool.sol";

contract LendingPoolLens {
    LendingPool public immutable pool;

    constructor(address lendingPool) {
        require(lendingPool != address(0), "ZERO_ADDRESS");
        pool = LendingPool(lendingPool);
    }

    // ============ ACTIVE OFFERS ============

    function getActiveLenderOffers() external view returns (uint256[] memory) {
        uint256[] memory offerIds = pool.getActiveLenderOfferIds();
        return _filterActiveOffers(offerIds);
    }

    function getActiveBorrowerRequests()
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory offerIds = pool.getActiveBorrowerRequestIds();
        return _filterActiveOffers(offerIds);
    }

    function _filterActiveOffers(
        uint256[] memory offerIds
    ) internal view returns (uint256[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < offerIds.length; i++) {
            (, , , , bool isActive, ) = pool.loanOffers(offerIds[i]);
            if (isActive) {
                count++;
            }
        }

        uint256[] memory activeOffers = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < offerIds.length; i++) {
            (, , , , bool isActive, ) = pool.loanOffers(offerIds[i]);
            if (isActive) {
                activeOffers[index] = offerIds[i];
                index++;
            }
        }

        return activeOffers;
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

    // ✅ FIXED: Return correct number of values matching the ABI
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
        // Counters live in LendingPool
        totalLoans = pool.nextLoanId() - 1;
        totalOffers = pool.nextOfferId() - 1;

        // Active offers - get actual arrays and return their length
        activeLenderOffers = pool.getActiveLenderOfferIds().length;
        activeBorrowerRequests = pool.getActiveBorrowerRequestIds().length;

        platformFeeRate = pool.platformFeeRate();

        return (
            totalLoans,
            totalOffers,
            activeLenderOffers,
            activeBorrowerRequests,
            platformFeeRate
        );
    }
}
