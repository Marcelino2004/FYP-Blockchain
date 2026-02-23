// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ReputationManager.sol";
import "./CollateralManager.sol";
import "./CoSigningManager.sol";
import "./LoanLogic.sol";
import "./ActiveOfferLib.sol";

/**
 * @title LendingPool
 * @notice Core P2P lending pool with reputation-based matching
 * @dev Integrates with ReputationManager, CollateralManager, and CoSigningManager
 */
contract LendingPool is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    ReputationManager public immutable reputationManager;
    CollateralManager public immutable collateralManager;
    CoSigningManager public coSigningManager; // ← NEW: mutable so it can be set after deploy

    // Counters
    uint256 public nextOfferId = 1;
    uint256 public nextLoanId = 1;

    // Storage
    mapping(uint256 => LoanOffer) public loanOffers;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public userOffers;
    mapping(address => uint256[]) public userLoans;

    // Active offers lists
    uint256[] public activeLenderOffers;
    uint256[] public activeBorrowerRequests;

    // Platform fee (in basis points)
    uint256 public platformFeeRate = 100; // 1%
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_PLATFORM_FEE = 500; // 5% max

    // Loan constraints
    uint256 public constant MIN_LOAN_DURATION = 1 days;
    uint256 public constant MAX_LOAN_DURATION = 365 days;
    uint256 public constant MAX_INTEREST_RATE = 5000; // 50%

    uint256 public constant MIN_COLLATERAL_RATIO = 12000;

    address public feeCollector;

    // ============ Enums ============

    enum LoanStatus {
        PENDING,
        ACTIVE,
        REPAID,
        DEFAULTED,
        CANCELLED
    }

    enum LoanType {
        LENDER_OFFER,
        BORROW_REQUEST
    }

    // ============ Structs ============

    struct LoanTerms {
        address tokenAddress;
        uint256 principalAmount;
        uint256 collateralAmount;
        address collateralToken;
        uint256 interestRate;
        uint256 duration;
        uint256 minReputation;
        uint256 collateralRatio;
    }

    struct LoanOffer {
        uint256 offerId;
        LoanType offerType;
        address creator;
        LoanTerms terms;
        bool isActive;
        uint256 createdAt;
    }

    struct Loan {
        uint256 loanId;
        LoanType loanType;
        address lender;
        address borrower;
        LoanTerms terms;
        LoanStatus status;
        uint256 startTime;
        uint256 dueTime;
        uint256 amountRepaid;
        uint256 collateralDepositId;
        bool hasCoSigner;
        address coSigner;
    }

    // ============ Events ============

    event LoanOfferCreated(
        uint256 indexed offerId,
        address indexed creator,
        LoanType offerType,
        uint256 principalAmount,
        uint256 interestRate,
        uint256 duration
    );

    event LoanOfferCancelled(uint256 indexed offerId, address indexed creator);

    event LoanMatched(
        uint256 indexed loanId,
        uint256 indexed offerId,
        address indexed lender,
        address borrower,
        uint256 principalAmount
    );

    event LoanRepayment(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amount,
        uint256 remainingAmount
    );

    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 totalRepaid
    );

    event LoanDefaulted(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 unpaidAmount
    );

    event CollateralLiquidated(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 recoveredAmount
    );

    event PlatformFeeCollected(uint256 indexed loanId, uint256 feeAmount);

    event PlatformFeeRateUpdated(uint256 oldRate, uint256 newRate);

    // ← NEW EVENT
    event CoSigningManagerUpdated(
        address indexed oldManager,
        address indexed newManager
    );

    // ============ Errors ============

    error LendingPool__InvalidAmount();
    error LendingPool__InvalidDuration();
    error LendingPool__InvalidInterestRate();
    error LendingPool__InvalidCollateralRatio();
    error LendingPool__OfferNotFound();
    error LendingPool__OfferNotActive();
    error LendingPool__UnauthorizedCancellation();
    error LendingPool__InsufficientReputation();
    error LendingPool__InsufficientCollateral();
    error LendingPool__LoanNotActive();
    error LendingPool__LoanNotOverdue();
    error LendingPool__InvalidRepaymentAmount();
    error LendingPool__ZeroAddress();
    error LendingPool__TransferFailed();
    error LendingPool__InvalidFeeRate();

    // ============ Constructor ============

    constructor(
        address _reputationManager,
        address _collateralManager,
        address _feeCollector
    ) {
        if (
            _reputationManager == address(0) ||
            _collateralManager == address(0) ||
            _feeCollector == address(0)
        ) {
            revert LendingPool__ZeroAddress();
        }

        reputationManager = ReputationManager(_reputationManager);
        collateralManager = CollateralManager(_collateralManager);
        feeCollector = _feeCollector;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ============ External Functions - Offer Management ============

    /**
     * @notice Create a new loan offer or borrow request
     * @param offerType Type of offer (LENDER_OFFER or BORROW_REQUEST)
     * @param terms The loan terms
     * @return offerId The ID of the created offer
     */
    function createLoanOffer(
        LoanType offerType,
        LoanTerms calldata terms
    ) external nonReentrant returns (uint256 offerId) {
        _validateLoanTerms(terms, offerType);

        offerId = nextOfferId++;

        loanOffers[offerId] = LoanOffer({
            offerId: offerId,
            offerType: offerType,
            creator: msg.sender,
            terms: terms,
            isActive: true,
            createdAt: block.timestamp
        });

        userOffers[msg.sender].push(offerId);

        if (offerType == LoanType.LENDER_OFFER) {
            activeLenderOffers.push(offerId);

            // Lender locks funds upfront
            IERC20(terms.tokenAddress).safeTransferFrom(
                msg.sender,
                address(this),
                terms.principalAmount
            );
        } else {
            activeBorrowerRequests.push(offerId);
        }

        emit LoanOfferCreated(
            offerId,
            msg.sender,
            offerType,
            terms.principalAmount,
            terms.interestRate,
            terms.duration
        );

        return offerId;
    }

    /**
     * @notice Cancel an active loan offer
     * @dev Also cancels any accepted co-signing records linked to this offer,
     *      reversing the reputation bonus given to the borrower.
     * @param offerId The ID of the offer to cancel
     */
    function cancelLoanOffer(uint256 offerId) external nonReentrant {
        LoanOffer storage offer = loanOffers[offerId];

        if (offer.creator == address(0)) revert LendingPool__OfferNotFound();
        if (!offer.isActive) revert LendingPool__OfferNotActive();
        if (offer.creator != msg.sender)
            revert LendingPool__UnauthorizedCancellation();

        offer.isActive = false;

        // Remove from active lists
        if (offer.offerType == LoanType.LENDER_OFFER) {
            ActiveOfferLib.remove(activeLenderOffers, offerId);
        } else {
            ActiveOfferLib.remove(activeBorrowerRequests, offerId);
        }

        // Return locked funds to lender
        if (offer.offerType == LoanType.LENDER_OFFER) {
            IERC20(offer.terms.tokenAddress).safeTransfer(
                msg.sender,
                offer.terms.principalAmount
            );
        }

        // ← NEW: cancel any active co-signing records for this offer so that
        //   (a) the reputation bonus given to the borrower is reversed, and
        //   (b) the co-signer's active count is decremented correctly.
        if (address(coSigningManager) != address(0)) {
            uint256[] memory recordIds = coSigningManager.getRecordsByOffer(
                offerId
            );
            for (uint256 i = 0; i < recordIds.length; i++) {
                CoSigningManager.CoSigningRecord
                    memory record = coSigningManager.getCoSigningRecord(
                        recordIds[i]
                    );
                if (record.isActive) {
                    // cancelCoSigningRecord reverses the bonus and marks inactive
                    coSigningManager.cancelCoSigningRecord(recordIds[i]);
                }
            }
        }

        emit LoanOfferCancelled(offerId, msg.sender);
    }

    /**
     * @notice Accept a loan offer and create an active loan
     * @param offerId The ID of the offer to accept
     * @param collateralDepositId The ID of the collateral deposit (for borrowers)
     * @return loanId The ID of the created loan
     */
    function acceptLoanOffer(
        uint256 offerId,
        uint256 collateralDepositId
    ) external nonReentrant returns (uint256 loanId) {
        LoanOffer storage offer = loanOffers[offerId];
        if (offer.creator == address(0)) revert LendingPool__OfferNotFound();
        if (!offer.isActive) revert LendingPool__OfferNotActive();

        address lender;
        address borrower;

        if (offer.offerType == LoanType.LENDER_OFFER) {
            // Lender created the offer — msg.sender is the borrower
            lender = offer.creator;
            borrower = msg.sender;

            // Enforce minimum reputation for borrower
            if (
                !reputationManager.meetsReputationRequirement(
                    borrower,
                    offer.terms.minReputation
                )
            ) {
                revert LendingPool__InsufficientReputation();
            }
        } else {
            // Borrower created the request — msg.sender is the lender
            lender = msg.sender;
            borrower = offer.creator;

            // Lender provides funds now
            IERC20(offer.terms.tokenAddress).safeTransferFrom(
                lender,
                address(this),
                offer.terms.principalAmount
            );
        }

        // Verify and lock collateral
        if (offer.terms.collateralAmount > 0) {
            bool sufficient = collateralManager.isCollateralSufficient(
                collateralDepositId,
                offer.terms.principalAmount,
                offer.terms.collateralRatio
            );

            if (!sufficient) revert LendingPool__InsufficientCollateral();

            collateralManager.lockCollateral(collateralDepositId, nextLoanId);
        }

        // Create the loan
        loanId = nextLoanId++;

        loans[loanId] = Loan({
            loanId: loanId,
            loanType: offer.offerType,
            lender: lender,
            borrower: borrower,
            terms: offer.terms,
            status: LoanStatus.ACTIVE,
            startTime: block.timestamp,
            dueTime: block.timestamp + offer.terms.duration,
            amountRepaid: 0,
            collateralDepositId: collateralDepositId,
            hasCoSigner: false,
            coSigner: address(0)
        });

        userLoans[lender].push(loanId);
        userLoans[borrower].push(loanId);

        if (address(coSigningManager) != address(0)) {
            uint256[] memory recordIds = coSigningManager.getRecordsByOffer(
                offerId
            );

            for (uint256 i = 0; i < recordIds.length; i++) {
                CoSigningManager.CoSigningRecord
                    memory record = coSigningManager.getCoSigningRecord(
                        recordIds[i]
                    );

                if (record.isActive && !record.wasCancelled) {
                    // Link this record to the newly created loan
                    coSigningManager.linkRecordToLoan(recordIds[i], loanId);

                    // Update loan struct to reflect co-signer
                    loans[loanId].hasCoSigner = true;
                    loans[loanId].coSigner = record.coSigner;

                    break; // Only one co-signer per loan for now
                }
            }
        }

        // Deactivate offer and remove from active list
        offer.isActive = false;
        if (offer.offerType == LoanType.LENDER_OFFER) {
            ActiveOfferLib.remove(activeLenderOffers, offerId);
        } else {
            ActiveOfferLib.remove(activeBorrowerRequests, offerId);
        }

        // Transfer principal to borrower (minus platform fee)
        uint256 platformFee = (offer.terms.principalAmount * platformFeeRate) /
            BASIS_POINTS;
        uint256 amountToBorrower = offer.terms.principalAmount - platformFee;

        IERC20(offer.terms.tokenAddress).safeTransfer(
            borrower,
            amountToBorrower
        );

        if (platformFee > 0) {
            IERC20(offer.terms.tokenAddress).safeTransfer(
                feeCollector,
                platformFee
            );
            emit PlatformFeeCollected(loanId, platformFee);
        }

        emit LoanMatched(
            loanId,
            offerId,
            lender,
            borrower,
            offer.terms.principalAmount
        );

        return loanId;
    }

    // ============ External Functions - Loan Management ============

    /**
     * @notice Repay an active loan (partial or full)
     * @param loanId The ID of the loan
     * @param amount The amount to repay
     */
    function repayLoan(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = loans[loanId];

        if (loan.status != LoanStatus.ACTIVE)
            revert LendingPool__LoanNotActive();
        if (amount == 0) revert LendingPool__InvalidRepaymentAmount();

        uint256 amountDue = LoanLogic.calculateAmountDue(
            loan.terms.principalAmount,
            loan.terms.interestRate
        );
        uint256 remainingAmount = amountDue - loan.amountRepaid;

        if (amount > remainingAmount) {
            amount = remainingAmount;
        }

        loan.amountRepaid += amount;

        // Transfer repayment from borrower to lender
        IERC20(loan.terms.tokenAddress).safeTransferFrom(
            msg.sender,
            loan.lender,
            amount
        );

        emit LoanRepayment(
            loanId,
            loan.borrower,
            amount,
            remainingAmount - amount
        );

        // Check if fully repaid
        if (loan.amountRepaid >= amountDue) {
            _completeLoanRepayment(loanId);
        }
    }

    /**
     * @notice Liquidate a defaulted loan
     * @param loanId The ID of the loan
     */
    function liquidateLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];

        if (loan.status != LoanStatus.ACTIVE)
            revert LendingPool__LoanNotActive();
        if (block.timestamp <= loan.dueTime)
            revert LendingPool__LoanNotOverdue();

        uint256 amountDue = LoanLogic.calculateAmountDue(
            loan.terms.principalAmount,
            loan.terms.interestRate
        );
        uint256 unpaidAmount = amountDue - loan.amountRepaid;

        // Liquidate collateral
        uint256 recoveredAmount = 0;
        if (loan.terms.collateralAmount > 0) {
            recoveredAmount = collateralManager.liquidateCollateral(
                loanId,
                unpaidAmount,
                loan.lender
            );
        }

        loan.status = LoanStatus.DEFAULTED;

        // Apply reputation penalty to borrower
        reputationManager.recordDefault(
            loan.borrower,
            loan.terms.principalAmount
        );

        // Penalize co-signer if one exists
        if (loan.hasCoSigner) {
            reputationManager.penalizeCoSigner(
                loan.coSigner,
                loan.borrower,
                loan.terms.principalAmount
            );
        }

        if (loan.hasCoSigner && address(coSigningManager) != address(0)) {
            uint256[] memory recordIds = coSigningManager.getLoanCoSigners(
                loanId
            );
            for (uint256 i = 0; i < recordIds.length; i++) {
                coSigningManager.releaseCoSigning(recordIds[i], false); // false = defaulted
            }
        }

        emit LoanDefaulted(loanId, loan.borrower, unpaidAmount);
        emit CollateralLiquidated(loanId, loan.borrower, recoveredAmount);
    }

    // ============ View Functions ============

    /**
     * @notice Check if a loan is past due
     */
    function isLoanOverdue(uint256 loanId) external view returns (bool) {
        Loan memory loan = loans[loanId];
        if (loan.status != LoanStatus.ACTIVE) return false;
        return block.timestamp > loan.dueTime;
    }

    /**
     * @notice Get loan details
     */
    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    /**
     * @notice Get loan offer details
     */
    function getLoanOffer(
        uint256 offerId
    ) external view returns (LoanOffer memory) {
        return loanOffers[offerId];
    }

    function getActiveLenderOfferIds()
        external
        view
        returns (uint256[] memory)
    {
        return activeLenderOffers;
    }

    function getActiveBorrowerRequestIds()
        external
        view
        returns (uint256[] memory)
    {
        return activeBorrowerRequests;
    }

    /**
     * @notice Get all loans for a user (as lender or borrower)
     */
    function getUserLoans(
        address user
    ) external view returns (uint256[] memory) {
        return userLoans[user];
    }

    /**
     * @notice Get user's loan offers
     */
    function getUserOffers(
        address user
    ) external view returns (uint256[] memory) {
        return userOffers[user];
    }

    /**
     * @notice Get the next loan ID (for counting total loans)
     */
    function getNextLoanId() external view returns (uint256) {
        return nextLoanId;
    }

    /**
     * @notice Get the next offer ID (for counting total offers)
     */
    function getNextOfferId() external view returns (uint256) {
        return nextOfferId;
    }

    /**
     * @notice Get the platform fee rate
     */
    function getPlatformFeeRate() external view returns (uint256) {
        return platformFeeRate;
    }

    /**
     * @notice Get the basis points constant
     */
    function getBasisPoints() external pure returns (uint256) {
        return BASIS_POINTS;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update platform fee rate
     * @param newFeeRate New fee rate in basis points
     */
    function setPlatformFeeRate(
        uint256 newFeeRate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeRate > MAX_PLATFORM_FEE) revert LendingPool__InvalidFeeRate();

        uint256 oldRate = platformFeeRate;
        platformFeeRate = newFeeRate;

        emit PlatformFeeRateUpdated(oldRate, newFeeRate);
    }

    /**
     * @notice Update fee collector address
     * @param newFeeCollector New fee collector address
     */
    function setFeeCollector(
        address newFeeCollector
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeCollector == address(0)) revert LendingPool__ZeroAddress();
        feeCollector = newFeeCollector;
    }

    /**
     * @notice Set the CoSigningManager address
     * @dev Called once after both contracts are deployed. Can be updated by admin.
     * @param _coSigningManager Address of the deployed CoSigningManager
     */
    function setCoSigningManager(
        address _coSigningManager
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_coSigningManager == address(0)) revert LendingPool__ZeroAddress();
        address old = address(coSigningManager);
        coSigningManager = CoSigningManager(_coSigningManager);
        emit CoSigningManagerUpdated(old, _coSigningManager);
    }

    // ============ Internal Functions ============

    /**
     * @notice Complete loan repayment and unlock collateral
     */
    function _completeLoanRepayment(uint256 loanId) internal {
        Loan storage loan = loans[loanId];

        loan.status = LoanStatus.REPAID;

        // Unlock collateral
        if (loan.terms.collateralAmount > 0) {
            collateralManager.unlockCollateral(loan.collateralDepositId);
        }

        // Update borrower reputation
        reputationManager.recordSuccessfulRepayment(
            loan.borrower,
            loan.terms.principalAmount
        );

        // Update lender reputation
        reputationManager.recordSuccessfulRepayment(
            loan.lender,
            loan.terms.principalAmount
        );

        // Reward co-signer if one exists
        if (loan.hasCoSigner) {
            reputationManager.rewardCoSigner(loan.coSigner, loan.borrower);
        }

        if (loan.hasCoSigner && address(coSigningManager) != address(0)) {
            // Find the record ID(s) for this loan
            uint256[] memory recordIds = coSigningManager.getLoanCoSigners(
                loanId
            );
            for (uint256 i = 0; i < recordIds.length; i++) {
                coSigningManager.releaseCoSigning(recordIds[i], true); // true = successful
            }
        }

        emit LoanRepaid(loanId, loan.borrower, loan.amountRepaid);
    }

    /**
     * @notice Validate loan terms
     */
    function _validateLoanTerms(
        LoanTerms calldata terms,
        LoanType offerType
    ) internal pure {
        if (terms.principalAmount == 0) revert LendingPool__InvalidAmount();
        if (
            terms.duration < MIN_LOAN_DURATION ||
            terms.duration > MAX_LOAN_DURATION
        ) revert LendingPool__InvalidDuration();
        if (terms.interestRate > MAX_INTEREST_RATE)
            revert LendingPool__InvalidInterestRate();

        if (offerType == LoanType.LENDER_OFFER) {
            // Lender sets the ratio as a requirement for the borrower.
            // A ratio of 0 means uncollateralized; otherwise enforce the floor.
            if (
                terms.collateralRatio != 0 &&
                terms.collateralRatio < MIN_COLLATERAL_RATIO
            ) revert LendingPool__InvalidCollateralRatio();
        } else {
            // Borrower request: they pre-deposit collateral themselves.
            // If they specify an amount, the ratio must meet the floor.
            // If no collateral, ratio must also be 0.
            if (terms.collateralAmount > 0) {
                if (terms.collateralRatio < MIN_COLLATERAL_RATIO)
                    revert LendingPool__InvalidCollateralRatio();
            } else {
                if (terms.collateralRatio != 0)
                    revert LendingPool__InvalidCollateralRatio();
            }
        }
    }

    /**
     * @notice Remove offer from active list
     */
    function _removeFromActiveList(
        uint256 offerId,
        LoanType offerType
    ) internal {
        uint256[] storage activeList = offerType == LoanType.LENDER_OFFER
            ? activeLenderOffers
            : activeBorrowerRequests;

        for (uint256 i = 0; i < activeList.length; i++) {
            if (activeList[i] == offerId) {
                activeList[i] = activeList[activeList.length - 1];
                activeList.pop();
                break;
            }
        }
    }
}
