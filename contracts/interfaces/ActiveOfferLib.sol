// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library ActiveOfferLib {
    //Remove an offerId from an active list (swap & pop)
    function remove(uint256[] storage list, uint256 offerId) internal {
        uint256 length = list.length;

        for (uint256 i = 0; i < length; i++) {
            if (list[i] == offerId) {
                list[i] = list[length - 1];
                list.pop();
                return;
            }
        }
    }
}
