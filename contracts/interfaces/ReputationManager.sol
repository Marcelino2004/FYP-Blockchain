// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ReputationManager
 * @notice Manages user reputation scores for decentralized lending platform
 * @dev Implements multi-factor reputation system with decay, anti-gaming, and co-signing
 */
contract ReputationManager is AccessControl, ReentrancyGuard {
    // ============ State Variables ============

    bytes32 public constant LENDING_POOL_ROLE = keccak256("LENDING_POOL_ROLE");
    bytes32 public constant COSIGNING_ROLE = keccak256("COSIGNING_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant DATA_FEED_ROLE = keccak256("DATA_FEED_ROLE");

    // Reputation score bounds
    uint256 public constant MIN_REPUTATION = 0;
    uint256 public constant MAX_REPUTATION = 1000;
    uint256 public constant STARTING_REPUTATION = 150;

    // Reputation weights (out of 100 for percentage)
    uint256 public constant REPAYMENT_WEIGHT = 20; // was 50% weight
    uint256 public constant TRANSACTION_WEIGHT = 45; // was 25% weight
    //uint256 public constant COSIGNING_WEIGHT = 0; // was 15% weight
    uint256 public constant WALLET_AGE_WEIGHT = 35; // was 10% weight

    // Decay parameters
    uint256 public constant DECAY_START_DAYS = 90; // Start decay after 90 days of inactivity
    uint256 public constant MAX_DECAY_PERCENTAGE = 50; // Max 50% reputation loss
    uint256 public constant DECAY_PERIOD_DAYS = 180; // Full decay over 180 days

    // Anti-gaming parameters
    uint256 public constant REPUTATION_CAP_PERIOD = 1 days;
    uint256 public constant MAX_REPUTATION_GAIN_PER_PERIOD = 50;
    uint256 public constant WALLET_AGE_CAP_DAYS = 365; // Wallet age contribution caps at 1 year
    uint256 public constant COSIGN_COOLDOWN = 30 days;
    uint256 public constant MAX_COSIGN_BONUS = 100;

    // Off-chain verification bonuses
    uint256 public constant EMAIL_VERIFICATION_BONUS = 60;
    uint256 public constant PHONE_VERIFICATION_BONUS = 140;

    // Repayment scoring
    uint256 public constant SUCCESSFUL_REPAYMENT_BASE = 20;
    uint256 public constant DEFAULT_PENALTY_BASE = 100;
    uint256 public constant COSIGNER_PENALTY_MULTIPLIER = 30; // 30% of borrower penalty

    // ============ Structs ============

    struct ReputationData {
        uint256 baseScore;
        uint256 totalTransactions;
        uint256 uniqueCounterparties;
        uint256 totalValueTransferred;
        uint256 successfulRepayments;
        uint256 totalRepaymentValue;
        uint256 defaults;
        uint256 totalDefaultValue;
        uint256 walletCreationTime;
        uint256 lastActivityTimestamp;
        uint256 lastReputationUpdate;
        bool emailVerified;
        bool phoneVerified;
        uint256 reputationGainedToday;
        uint256 lastDailyResetTimestamp;
        uint256 dailyScoreSnapshot; // score at the start of the current day
        uint256 lastSnapshotTimestamp; // when the snapshot was taken
    }

    struct CoSigningHistory {
        mapping(address => uint256) coSignCount; // borrower => count
        mapping(address => uint256) lastCoSignTime; // borrower => timestamp
        uint256 totalActiveCoSigns;
    }

    // ============ Storage ============

    mapping(address => ReputationData) private reputationData;
    mapping(address => CoSigningHistory) private coSigningHistory;
    mapping(address => mapping(address => bool)) private hasInteracted; // For unique counterparties
    mapping(address => mapping(uint256 => uint256))
        public coSigningBonusByOffer;

    // ============ Events ============

    event ReputationUpdated(
        address indexed user,
        uint256 oldScore,
        uint256 newScore,
        string reason
    );

    event OffChainVerification(
        address indexed user,
        string verificationType,
        uint256 bonusAdded
    );

    event ReputationDecay(
        address indexed user,
        uint256 decayAmount,
        uint256 daysSinceActivity
    );

    event ReputationPenalty(
        address indexed user,
        uint256 penaltyAmount,
        string reason
    );

    event OnChainMetricsUpdated(
        address indexed user,
        uint256 transactions,
        uint256 counterparties,
        uint256 totalValue
    );

    // ============ Errors ============

    error ReputationManager__Unauthorized();
    error ReputationManager__InvalidAddress();
    error ReputationManager__AlreadyVerified();
    error ReputationManager__ReputationCapReached();
    error ReputationManager__InvalidAmount();

    // ============ Constructor ============

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
        _grantRole(DATA_FEED_ROLE, msg.sender);
    }

    // ============ External Functions ============

    /**
     * @notice Get the current reputation score for a user (with decay applied)
     * @param user The address of the user
     * @return The calculated reputation score
     */
    function getReputationScore(address user) external view returns (uint256) {
        return _calculateReputationScore(user);
    }

    /**
     * @notice Get detailed reputation data for a user
     * @param user The address of the user
     * @return ReputationData struct with all metrics
     */
    function getReputationData(
        address user
    ) external view returns (ReputationData memory) {
        return reputationData[user];
    }

    /**
     * @notice Initialize reputation for a new user
     * @param user The address of the user
     */
    function initializeReputation(
        address user
    ) external onlyRole(DATA_FEED_ROLE) {
        if (user == address(0)) revert ReputationManager__InvalidAddress();

        ReputationData storage data = reputationData[user];

        // Only initialize if not already initialized
        if (data.walletCreationTime == 0) {
            data.baseScore = STARTING_REPUTATION;
            data.walletCreationTime = block.timestamp;
            data.lastActivityTimestamp = block.timestamp;
            data.lastReputationUpdate = block.timestamp;
            data.lastDailyResetTimestamp = block.timestamp;
            data.dailyScoreSnapshot = STARTING_REPUTATION / 2;

            emit ReputationUpdated(
                user,
                0,
                STARTING_REPUTATION,
                "Initial reputation"
            );
        }
    }

    /**
     * @notice Record successful loan repayment and update reputation
     * @param borrower The address of the borrower
     * @param loanAmount The amount repaid
     */
    function recordSuccessfulRepayment(
        address borrower,
        uint256 loanAmount
    ) external onlyRole(LENDING_POOL_ROLE) nonReentrant {
        if (borrower == address(0)) revert ReputationManager__InvalidAddress();
        if (loanAmount == 0) revert ReputationManager__InvalidAmount();

        _ensureInitialized(borrower);

        ReputationData storage data = reputationData[borrower];
        uint256 oldScore = _calculateReputationScore(borrower);

        // Update repayment history
        data.successfulRepayments++;
        data.totalRepaymentValue += loanAmount;
        data.lastActivityTimestamp = block.timestamp;

        // Calculate reputation bonus based on loan amount
        uint256 bonus = _calculateRepaymentBonus(loanAmount);

        data.baseScore = _min(data.baseScore + bonus, MAX_REPUTATION);

        _checkDailyScoreCap(borrower, oldScore);

        uint256 newScore = _calculateReputationScore(borrower);
        emit ReputationUpdated(
            borrower,
            oldScore,
            newScore,
            "Successful repayment"
        );
    }

    /**
     * @notice Record loan default and apply penalty
     * @param borrower The address of the borrower who defaulted
     * @param loanAmount The amount of the defaulted loan
     */
    function recordDefault(
        address borrower,
        uint256 loanAmount
    ) external onlyRole(LENDING_POOL_ROLE) nonReentrant {
        if (borrower == address(0)) revert ReputationManager__InvalidAddress();
        if (loanAmount == 0) revert ReputationManager__InvalidAmount();

        _ensureInitialized(borrower);

        ReputationData storage data = reputationData[borrower];
        uint256 oldScore = _calculateReputationScore(borrower);

        // Update default history
        data.defaults++;
        data.totalDefaultValue += loanAmount;
        data.lastActivityTimestamp = block.timestamp;

        // Calculate penalty (severe)
        uint256 penalty = _calculateDefaultPenalty(
            loanAmount,
            data.totalRepaymentValue
        );

        // Apply penalty
        if (data.baseScore > penalty) {
            data.baseScore -= penalty;
        } else {
            data.baseScore = MIN_REPUTATION;
        }

        uint256 newScore = _calculateReputationScore(borrower);
        emit ReputationPenalty(borrower, penalty, "Loan default");
        emit ReputationUpdated(
            borrower,
            oldScore,
            newScore,
            "Default penalty applied"
        );
    }

    /**
     * @notice Record off-chain verification (email/phone)
     * @param user The address of the user
     * @param verificationType "email" or "phone"
     */
    function recordOffChainVerification(
        address user,
        string calldata verificationType
    ) external onlyRole(VERIFIER_ROLE) nonReentrant {
        if (user == address(0)) revert ReputationManager__InvalidAddress();

        _ensureInitialized(user);

        ReputationData storage data = reputationData[user];
        uint256 oldScore = _calculateReputationScore(user);
        uint256 bonus = 0;

        if (keccak256(bytes(verificationType)) == keccak256(bytes("email"))) {
            if (data.emailVerified) revert ReputationManager__AlreadyVerified();
            data.emailVerified = true;
            bonus = EMAIL_VERIFICATION_BONUS;
        } else if (
            keccak256(bytes(verificationType)) == keccak256(bytes("phone"))
        ) {
            if (data.phoneVerified) revert ReputationManager__AlreadyVerified();
            data.phoneVerified = true;
            bonus = PHONE_VERIFICATION_BONUS;
        }

        if (bonus > 0) {
            data.baseScore = _min(data.baseScore + bonus, MAX_REPUTATION);
            data.lastActivityTimestamp = block.timestamp;

            uint256 newScore = _calculateReputationScore(user);
            emit OffChainVerification(user, verificationType, bonus);
            emit ReputationUpdated(user, oldScore, newScore, verificationType);
        }
    }

    /**
     * @notice Add co-signing bonus to borrower's reputation
     * @param borrower The address of the borrower
     * @param coSigner The address of the co-signer
     * @param coSignerReputation The reputation of the co-signer
     * @return The bonus amount added
     */
    function addCoSigningBonus(
        address borrower,
        address coSigner,
        uint256 coSignerReputation,
        uint256 loanOfferId
    ) external onlyRole(COSIGNING_ROLE) nonReentrant returns (uint256) {
        if (borrower == address(0) || coSigner == address(0)) {
            revert ReputationManager__InvalidAddress();
        }

        _ensureInitialized(borrower);
        _ensureInitialized(coSigner);

        uint256 oldScore = _calculateReputationScore(borrower);

        // Calculate bonus with diminishing returns
        uint256 bonus = _calculateCoSigningBonus(
            borrower,
            coSigner,
            coSignerReputation
        );

        if (bonus > 0) {
            ReputationData storage data = reputationData[borrower];

            // Check daily cap
            _checkAndResetDailyCap(borrower);
            if (
                data.reputationGainedToday + bonus >
                MAX_REPUTATION_GAIN_PER_PERIOD
            ) {
                bonus =
                    MAX_REPUTATION_GAIN_PER_PERIOD -
                    data.reputationGainedToday;
            }

            coSigningBonusByOffer[borrower][loanOfferId] = _min(
                coSigningBonusByOffer[borrower][loanOfferId] + bonus,
                MAX_COSIGN_BONUS
            );
            data.reputationGainedToday += bonus;
            data.lastActivityTimestamp = block.timestamp;

            // Update co-signing history
            CoSigningHistory storage history = coSigningHistory[coSigner];
            history.coSignCount[borrower]++;
            history.lastCoSignTime[borrower] = block.timestamp;
            history.totalActiveCoSigns++;

            uint256 newScore = _calculateReputationScore(borrower);

            emit ReputationUpdated(
                borrower,
                oldScore,
                newScore,
                "Co-signing bonus pending"
            );
        }

        return bonus;
    }

    /**
     * @notice Apply penalty to co-signer when borrower defaults
     * @param coSigner The address of the co-signer
     * @param borrower The address of the borrower who defaulted
     * @param loanAmount The amount of the defaulted loan
     */
    function penalizeCoSigner(
        address coSigner,
        address borrower,
        uint256 loanAmount
    ) external onlyRole(COSIGNING_ROLE) nonReentrant {
        if (coSigner == address(0) || borrower == address(0)) {
            revert ReputationManager__InvalidAddress();
        }

        _ensureInitialized(coSigner);

        ReputationData storage data = reputationData[coSigner];
        uint256 oldScore = _calculateReputationScore(coSigner);

        // Calculate penalty (30% of what borrower would get)
        uint256 borrowerPenalty = _calculateDefaultPenalty(loanAmount, 0);
        uint256 coSignerPenalty = (borrowerPenalty *
            COSIGNER_PENALTY_MULTIPLIER) / 100;

        // Apply penalty
        if (data.baseScore > coSignerPenalty) {
            data.baseScore -= coSignerPenalty;
        } else {
            data.baseScore = MIN_REPUTATION;
        }

        data.lastActivityTimestamp = block.timestamp;

        // Update co-signing history
        CoSigningHistory storage history = coSigningHistory[coSigner];
        if (history.totalActiveCoSigns > 0) {
            history.totalActiveCoSigns--;
        }

        uint256 newScore = _calculateReputationScore(coSigner);
        emit ReputationPenalty(
            coSigner,
            coSignerPenalty,
            "Co-signed loan defaulted"
        );
        emit ReputationUpdated(
            coSigner,
            oldScore,
            newScore,
            "Co-signer penalty"
        );
    }

    /**
     * @notice Reward co-signer when borrower repays successfully
     * @param coSigner The address of the co-signer
     * @param borrower The address of the borrower
     */
    function rewardCoSigner(
        address coSigner,
        address borrower
    ) external onlyRole(COSIGNING_ROLE) nonReentrant {
        if (coSigner == address(0) || borrower == address(0)) {
            revert ReputationManager__InvalidAddress();
        }

        _ensureInitialized(coSigner);

        ReputationData storage data = reputationData[coSigner];
        uint256 oldScore = _calculateReputationScore(coSigner);

        // Small reward for successful co-signing
        uint256 reward = 10;

        data.baseScore = _min(data.baseScore + reward, MAX_REPUTATION);
        data.lastActivityTimestamp = block.timestamp;

        // Update co-signing history
        CoSigningHistory storage history = coSigningHistory[coSigner];
        if (history.totalActiveCoSigns > 0) {
            history.totalActiveCoSigns--;
        }

        _checkDailyScoreCap(coSigner, oldScore);

        uint256 newScore = _calculateReputationScore(coSigner);
        emit ReputationUpdated(
            coSigner,
            oldScore,
            newScore,
            "Co-signing reward"
        );
    }

    /**
     * @notice Update on-chain transaction metrics for a user
     * @param user The address of the user
     * @param txCount Number of transactions
     * @param counterparty Address interacted with
     * @param txValue Value of transaction
     */
    function updateOnChainMetrics(
        address user,
        uint256 txCount,
        address counterparty,
        uint256 txValue
    ) external onlyRole(DATA_FEED_ROLE) {
        if (user == address(0)) revert ReputationManager__InvalidAddress();

        _ensureInitialized(user);

        ReputationData storage data = reputationData[user];

        // Update transaction count
        data.totalTransactions += txCount;

        // Update unique counterparties
        if (counterparty != address(0) && !hasInteracted[user][counterparty]) {
            hasInteracted[user][counterparty] = true;
            data.uniqueCounterparties++;
        }

        // Update total value (small transactions contribute less)
        if (txValue > 0.01 ether) {
            // Minimum threshold
            data.totalValueTransferred += txValue;
        }

        data.lastActivityTimestamp = block.timestamp;

        emit OnChainMetricsUpdated(
            user,
            data.totalTransactions,
            data.uniqueCounterparties,
            data.totalValueTransferred
        );
    }

    /**
     * @notice Check if a user meets minimum reputation requirement
     * @param user The address of the user
     * @param minimumReputation The minimum reputation required
     * @return true if user meets requirement
     */
    function meetsReputationRequirement(
        address user,
        uint256 minimumReputation
    ) external view returns (bool) {
        return _calculateReputationScore(user) >= minimumReputation;
    }

    /**
     * @notice Get co-signing count for a pair
     * @param coSigner The co-signer address
     * @param borrower The borrower address
     * @return The number of times co-signed
     */
    function getCoSignCount(
        address coSigner,
        address borrower
    ) external view returns (uint256) {
        return coSigningHistory[coSigner].coSignCount[borrower];
    }

    function getOfferCoSigningBonus(
        address borrower,
        uint256 loanOfferId
    ) external view returns (uint256) {
        return coSigningBonusByOffer[borrower][loanOfferId];
    }

    /**
     * @notice Check if diminishing returns apply
     * @param coSigner The co-signer address
     * @param borrower The borrower address
     * @return true if diminishing returns apply
     */
    function hasDiminishingReturns(
        address coSigner,
        address borrower
    ) external view returns (bool) {
        CoSigningHistory storage history = coSigningHistory[coSigner];

        // Check if in cooldown period
        if (
            block.timestamp < history.lastCoSignTime[borrower] + COSIGN_COOLDOWN
        ) {
            return history.coSignCount[borrower] > 0;
        }

        return false;
    }

    // ============ Internal Functions ============

    /**
     * @notice Calculate total reputation score with all factors
     * @param user The address of the user
     * @return The final reputation score
     */
    function _calculateReputationScore(
        address user
    ) internal view returns (uint256) {
        ReputationData storage data = reputationData[user];
        if (data.walletCreationTime == 0) return 0;

        uint256 score = data.baseScore;

        uint256 defaultPenaltyScore = _calculateRepaymentScore(data); // now a penalty
        uint256 transactionScore = _calculateTransactionScore(data);
        uint256 walletAgeScore = _calculateWalletAgeScore(data);

        // Weighted bonus from structural signals (only adds up to 80 here)
        uint256 weightedBonus = (transactionScore *
            TRANSACTION_WEIGHT +
            walletAgeScore *
            WALLET_AGE_WEIGHT) / 80;

        // Weighted drag from default history
        uint256 weightedPenalty = (defaultPenaltyScore * REPAYMENT_WEIGHT) /
            100;

        score = (score + weightedBonus) / 2;

        // Apply default drag
        if (score > weightedPenalty) {
            score -= weightedPenalty;
        } else {
            score = MIN_REPUTATION;
        }

        // Apply decay
        uint256 decayAmount = _calculateDecay(data);
        score = score > decayAmount ? score - decayAmount : MIN_REPUTATION;

        return _min(score, MAX_REPUTATION);
    }

    /**
     * @notice Calculate repayment history score
     */
    function _calculateRepaymentScore(
        ReputationData storage data
    ) internal view returns (uint256) {
        // No repayment credit here — flows through baseScore instead.
        // This component only signals default history and is used as a penalty drag.
        if (data.defaults == 0) return 0;

        uint256 defaultPenalty = data.defaults * 80;

        // Partial mitigation if user has substantial repayment history
        uint256 mitigationScore = 0;
        if (data.totalRepaymentValue > 0) {
            mitigationScore = _min(
                (data.totalRepaymentValue / 1 ether) * 2,
                60
            );
        }

        if (mitigationScore >= defaultPenalty) return 0;
        return _min(defaultPenalty - mitigationScore, 300); // returns a PENALTY magnitude
    }

    /**
     * @notice Calculate transaction activity score
     */
    function _calculateTransactionScore(
        ReputationData storage data
    ) internal view returns (uint256) {
        // Transaction count (capped to prevent spam)
        uint256 txScore = _min(data.totalTransactions * 2, 100);

        // Unique counterparties (diversity bonus)
        uint256 diversityScore = _min(data.uniqueCounterparties * 5, 100);

        // Total value transferred (meaningful activity)
        uint256 valueScore = 0;
        if (data.totalValueTransferred > 0) {
            valueScore = _min((data.totalValueTransferred / 1 ether) * 3, 100);
        }

        return _min(((txScore + diversityScore + valueScore) * 2) / 3, 200);
    }

    /**
     * @notice Calculate wallet age score
     */
    function _calculateWalletAgeScore(
        ReputationData storage data
    ) internal view returns (uint256) {
        uint256 ageDays = (block.timestamp - data.walletCreationTime) / 1 days;

        // Cap at 1 year
        ageDays = _min(ageDays, WALLET_AGE_CAP_DAYS);

        // Linear increase up to cap
        return (ageDays * 100) / WALLET_AGE_CAP_DAYS;
    }

    /**
     * @notice Calculate reputation decay based on inactivity
     */
    function _calculateDecay(
        ReputationData storage data
    ) internal view returns (uint256) {
        uint256 daysSinceActivity = (block.timestamp -
            data.lastActivityTimestamp) / 1 days;

        if (daysSinceActivity < DECAY_START_DAYS) {
            return 0;
        }

        uint256 decayDays = daysSinceActivity - DECAY_START_DAYS;

        if (decayDays >= DECAY_PERIOD_DAYS) {
            // Max decay reached
            return (data.baseScore * MAX_DECAY_PERCENTAGE) / 100;
        }

        // Linear decay over period
        uint256 decayPercentage = (decayDays * MAX_DECAY_PERCENTAGE) /
            DECAY_PERIOD_DAYS;
        return (data.baseScore * decayPercentage) / 100;
    }

    /**
     * @notice Calculate repayment bonus
     */
    function _calculateRepaymentBonus(
        uint256 loanAmount
    ) internal pure returns (uint256) {
        // Base bonus + amount-based bonus (capped)
        uint256 amountBonus = _min((loanAmount / 1 ether) * 2, 30);
        return SUCCESSFUL_REPAYMENT_BASE + amountBonus;
    }

    /**
     * @notice Calculate default penalty
     */
    function _calculateDefaultPenalty(
        uint256 loanAmount,
        uint256 totalRepaymentValue
    ) internal pure returns (uint256) {
        // Severe base penalty
        uint256 basePenalty = DEFAULT_PENALTY_BASE;

        // Additional penalty based on loan size
        uint256 amountPenalty = _min((loanAmount / 1 ether) * 10, 100);

        // Less penalty if user has good history
        uint256 historyReduction = 0;
        if (totalRepaymentValue > loanAmount * 10) {
            historyReduction = 20;
        }

        uint256 totalPenalty = basePenalty + amountPenalty;

        if (totalPenalty > historyReduction) {
            return totalPenalty - historyReduction;
        }

        return basePenalty;
    }

    /**
     * @notice Calculate co-signing bonus with diminishing returns
     */
    function _calculateCoSigningBonus(
        address borrower,
        address coSigner,
        uint256 coSignerReputation
    ) internal view returns (uint256) {
        CoSigningHistory storage history = coSigningHistory[coSigner];

        // Base bonus is proportional to co-signer's reputation
        uint256 baseBonus = (coSignerReputation * 10) / 100; // 10% of co-signer reputation
        baseBonus = _min(baseBonus, 50); // Cap at 50

        // Check if in cooldown period
        if (
            block.timestamp < history.lastCoSignTime[borrower] + COSIGN_COOLDOWN
        ) {
            // Apply diminishing returns based on count
            uint256 count = history.coSignCount[borrower];

            if (count == 0) {
                return baseBonus; // First time: full bonus
            } else if (count == 1) {
                return (baseBonus * 60) / 100; // Second time: 60%
            } else if (count == 2) {
                return (baseBonus * 30) / 100; // Third time: 30%
            } else {
                return (baseBonus * 10) / 100; // After that: 10%
            }
        }

        // Cooldown passed, reset to full bonus
        return baseBonus;
    }

    /**
     * @notice Decrement totalActiveCoSigns for a co-signer
     *         Called when a co-signing record is cancelled before loan completion
     */
    function decrementActiveCoSigns(
        address coSigner
    ) external onlyRole(COSIGNING_ROLE) {
        CoSigningHistory storage history = coSigningHistory[coSigner];
        if (history.totalActiveCoSigns > 0) {
            history.totalActiveCoSigns--;
        }
    }

    function applyOfferCoSigningBonus(
        address borrower,
        uint256 loanOfferId
    ) external onlyRole(COSIGNING_ROLE) nonReentrant returns (uint256) {
        uint256 bonus = coSigningBonusByOffer[borrower][loanOfferId];
        if (bonus == 0) return 0;

        // Apply it to baseScore now that the loan is real
        ReputationData storage data = reputationData[borrower];
        uint256 oldScore = _calculateReputationScore(borrower);

        data.baseScore = _min(data.baseScore + bonus, MAX_REPUTATION);

        // Clear the offer-specific bonus so it can't be applied again
        delete coSigningBonusByOffer[borrower][loanOfferId];

        _checkDailyScoreCap(borrower, oldScore);

        uint256 newScore = _calculateReputationScore(borrower);

        emit ReputationUpdated(
            borrower,
            oldScore,
            newScore,
            "Co-signing bonus applied"
        );

        return bonus;
    }

    function clearOfferCoSigningBonus(
        address borrower,
        uint256 loanOfferId
    ) external onlyRole(COSIGNING_ROLE) {
        delete coSigningBonusByOffer[borrower][loanOfferId];
    }

    /**
     * @notice Ensure user is initialized
     */
    function _ensureInitialized(address user) internal {
        if (reputationData[user].walletCreationTime == 0) {
            reputationData[user].baseScore = STARTING_REPUTATION;
            reputationData[user].walletCreationTime = block.timestamp;
            reputationData[user].lastActivityTimestamp = block.timestamp;
            reputationData[user].lastReputationUpdate = block.timestamp;
            reputationData[user].lastDailyResetTimestamp = block.timestamp;
            reputationData[user].lastSnapshotTimestamp = block.timestamp;
            reputationData[user].dailyScoreSnapshot = STARTING_REPUTATION / 2;
        }
    }

    /**
     * @notice Check and reset daily reputation gain cap
     */
    function _checkAndResetDailyCap(address user) internal {
        ReputationData storage data = reputationData[user];

        if (block.timestamp >= data.lastDailyResetTimestamp + 1 days) {
            data.reputationGainedToday = 0;
            data.lastDailyResetTimestamp = block.timestamp;
        }
    }

    /**
     * @notice Helper function to get minimum of two numbers
     */
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _checkDailyScoreCap(
        address user,
        uint256 scoreBeforeAction
    ) internal {
        ReputationData storage data = reputationData[user];

        if (block.timestamp >= data.lastSnapshotTimestamp + 1 days) {
            data.dailyScoreSnapshot = scoreBeforeAction;
            data.lastSnapshotTimestamp = block.timestamp;
        }

        uint256 currentScore = _calculateReputationScore(user);
        uint256 allowedMax = data.dailyScoreSnapshot +
            MAX_REPUTATION_GAIN_PER_PERIOD;

        if (currentScore > allowedMax) {
            uint256 excess = currentScore - allowedMax;
            if (data.baseScore > excess) {
                data.baseScore -= excess;
            } else {
                data.baseScore = 0;
            }
        }
    }
}
