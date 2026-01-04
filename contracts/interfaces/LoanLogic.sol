// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library LoanLogic {
    uint256 internal constant BASIS_POINTS = 10000;

    function calculateAmountDue(
        uint256 principal,
        uint256 interestRate
    ) internal pure returns (uint256) {
        return principal + (principal * interestRate) / BASIS_POINTS;
    }
}
