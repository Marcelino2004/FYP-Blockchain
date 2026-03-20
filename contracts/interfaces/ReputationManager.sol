// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

//Manages user reputation scores for decentralized lending platform
contract ReputationManager is AccessControl, ReentrancyGuard {
    // ============ State Variables ============

    bytes32 public constant LENDING_POOL_ROLE = keccak256("LENDING_POOL_ROLE");
    bytes32 public constant COSIGNING_ROLE = keccak256("COSIGNING_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant DATA_FEED_ROLE = keccak256("DATA_FEED_ROLE");

    // Reputation score bounds
    uint256 public constant MIN_REPUTATION = 0;
    uint256 public constant MAX_REPUTATION = 1000;
    uint256 public constant STARTING_REPUTATION = 200;

    // Reputation weights (out of 100 for percentage)
    uint256 public constant REPAYMENT_WEIGHT = 20;
    uint256 public constant TRANSACTION_WEIGHT = 45;
    uint256 public constant WALLET_AGE_WEIGHT = 35;

    // Decay parameters
    uint256 public constant DECAY_START_DAYS = 90;
    uint256 public constant MAX_DECAY_PERCENTAGE = 50;
    uint256 public constant DECAY_PERIOD_DAYS = 180;

    // Anti-gaming parameters
    uint256 public constant REPUTATION_CAP_PERIOD = 1 days;
    uint256 public constant MAX_REPUTATION_GAIN_PER_PERIOD = 100;
    uint256 public constant WALLET_AGE_CAP_DAYS = 365;
    uint256 public constant COSIGN_COOLDOWN = 30 days;
    uint256 public constant MAX_COSIGN_BONUS = 100;

    // Off-chain verification bonuses (exempt from daily cap)
    uint256 public constant EMAIL_VERIFICATION_BONUS = 60;
    uint256 public constant PHONE_VERIFICATION_BONUS = 140;

    // Repayment scoring
    uint256 public constant SUCCESSFUL_REPAYMENT_BASE = 20;
    uint256 public constant DEFAULT_PENALTY_BASE = 100;
    uint256 public constant COSIGNER_PENALTY_MULTIPLIER = 30;

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
    }

    struct CoSigningHistory {
        mapping(address => uint256) coSignCount;
        mapping(address => uint256) lastCoSignTime;
        uint256 totalActiveCoSigns;
    }

    // ============ Storage ============

    mapping(address => ReputationData) private reputationData;
    mapping(address => CoSigningHistory) private coSigningHistory;
    mapping(address => mapping(address => bool)) private hasInteracted;
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

    function getReputationScore(address user) external view returns (uint256) {
        return _calculateReputationScore(user);
    }

    function getReputationData(
        address user
    ) external view returns (ReputationData memory) {
        return reputationData[user];
    }

    function initializeReputation(
        address user
    ) external onlyRole(DATA_FEED_ROLE) {
        if (user == address(0)) revert ReputationManager__InvalidAddress();

        ReputationData storage data = reputationData[user];

        if (data.walletCreationTime == 0) {
            data.baseScore = STARTING_REPUTATION;
            data.walletCreationTime = block.timestamp;
            data.lastActivityTimestamp = block.timestamp;
            data.lastReputationUpdate = block.timestamp;
            data.lastDailyResetTimestamp = block.timestamp;

            emit ReputationUpdated(
                user,
                0,
                STARTING_REPUTATION,
                "Initial reputation"
            );
        }
    }

    //Record successful loan repayment and update reputation.
    function recordSuccessfulRepayment(
        address borrower,
        uint256 loanAmount
    ) external onlyRole(LENDING_POOL_ROLE) nonReentrant {
        if (borrower == address(0)) revert ReputationManager__InvalidAddress();
        if (loanAmount == 0) revert ReputationManager__InvalidAmount();

        _ensureInitialized(borrower);

        ReputationData storage data = reputationData[borrower];
        uint256 oldScore = _calculateReputationScore(borrower);

        data.successfulRepayments++;
        data.totalRepaymentValue += loanAmount;
        data.lastActivityTimestamp = block.timestamp;

        uint256 bonus = _calculateRepaymentBonus(loanAmount);

        // Clamp to remaining daily allowance before applying
        bonus = _clampToDailyCap(borrower, bonus);

        if (bonus > 0) {
            data.baseScore = _min(data.baseScore + bonus, MAX_REPUTATION);
            data.reputationGainedToday += bonus;
        }

        uint256 newScore = _calculateReputationScore(borrower);
        emit ReputationUpdated(
            borrower,
            oldScore,
            newScore,
            "Successful repayment"
        );
    }

    function recordDefault(
        address borrower,
        uint256 loanAmount
    ) external onlyRole(LENDING_POOL_ROLE) nonReentrant {
        if (borrower == address(0)) revert ReputationManager__InvalidAddress();
        if (loanAmount == 0) revert ReputationManager__InvalidAmount();

        _ensureInitialized(borrower);

        ReputationData storage data = reputationData[borrower];
        uint256 oldScore = _calculateReputationScore(borrower);

        data.defaults++;
        data.totalDefaultValue += loanAmount;
        data.lastActivityTimestamp = block.timestamp;

        uint256 penalty = _calculateDefaultPenalty(
            loanAmount,
            data.totalRepaymentValue
        );

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

    //Record off-chain verification (email/phone).
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
            // Applied directly — no daily cap
            data.baseScore = _min(data.baseScore + bonus, MAX_REPUTATION);
            data.lastActivityTimestamp = block.timestamp;

            uint256 newScore = _calculateReputationScore(user);
            emit OffChainVerification(user, verificationType, bonus);
            emit ReputationUpdated(user, oldScore, newScore, verificationType);
        }
    }

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

        uint256 bonus = _calculateCoSigningBonus(
            borrower,
            coSigner,
            coSignerReputation
        );
        if (bonus > 0) {
            ReputationData storage data = reputationData[borrower];

            coSigningBonusByOffer[borrower][loanOfferId] = _min(
                coSigningBonusByOffer[borrower][loanOfferId] + bonus,
                MAX_COSIGN_BONUS
            );
            data.lastActivityTimestamp = block.timestamp;
        }

        // Always update co-signing history (for diminishing returns tracking)
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

        return bonus;
    }

    function applyOfferCoSigningBonus(
        address borrower,
        uint256 loanOfferId
    ) external onlyRole(COSIGNING_ROLE) nonReentrant returns (uint256) {
        uint256 bonus = coSigningBonusByOffer[borrower][loanOfferId];
        if (bonus == 0) return 0;

        ReputationData storage data = reputationData[borrower];
        uint256 oldScore = _calculateReputationScore(borrower);

        data.baseScore = _min(data.baseScore + bonus, MAX_REPUTATION);
        delete coSigningBonusByOffer[borrower][loanOfferId];

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

        uint256 borrowerPenalty = _calculateDefaultPenalty(loanAmount, 0);
        uint256 coSignerPenalty = (borrowerPenalty *
            COSIGNER_PENALTY_MULTIPLIER) / 100;

        if (data.baseScore > coSignerPenalty) {
            data.baseScore -= coSignerPenalty;
        } else {
            data.baseScore = MIN_REPUTATION;
        }

        data.lastActivityTimestamp = block.timestamp;

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

        uint256 reward = _clampToDailyCap(coSigner, 10);

        if (reward > 0) {
            data.baseScore = _min(data.baseScore + reward, MAX_REPUTATION);
            data.reputationGainedToday += reward;
        }

        data.lastActivityTimestamp = block.timestamp;

        CoSigningHistory storage history = coSigningHistory[coSigner];
        if (history.totalActiveCoSigns > 0) {
            history.totalActiveCoSigns--;
        }

        uint256 newScore = _calculateReputationScore(coSigner);
        emit ReputationUpdated(
            coSigner,
            oldScore,
            newScore,
            "Co-signing reward"
        );
    }

    function updateOnChainMetrics(
        address user,
        uint256 txCount,
        address counterparty,
        uint256 txValue
    ) external onlyRole(DATA_FEED_ROLE) {
        if (user == address(0)) revert ReputationManager__InvalidAddress();

        _ensureInitialized(user);

        ReputationData storage data = reputationData[user];

        data.totalTransactions += txCount;

        if (counterparty != address(0) && !hasInteracted[user][counterparty]) {
            hasInteracted[user][counterparty] = true;
            data.uniqueCounterparties++;
        }

        if (txValue > 0.01 ether) {
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

    function decrementActiveCoSigns(
        address coSigner
    ) external onlyRole(COSIGNING_ROLE) {
        CoSigningHistory storage history = coSigningHistory[coSigner];
        if (history.totalActiveCoSigns > 0) {
            history.totalActiveCoSigns--;
        }
    }

    function meetsReputationRequirement(
        address user,
        uint256 minimumReputation
    ) external view returns (bool) {
        return _calculateReputationScore(user) >= minimumReputation;
    }

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

    function hasDiminishingReturns(
        address coSigner,
        address borrower
    ) external view returns (bool) {
        CoSigningHistory storage history = coSigningHistory[coSigner];
        if (
            block.timestamp < history.lastCoSignTime[borrower] + COSIGN_COOLDOWN
        ) {
            return history.coSignCount[borrower] > 0;
        }
        return false;
    }

    function getRemainingDailyCap(
        address user
    ) external view returns (uint256) {
        ReputationData storage data = reputationData[user];
        if (block.timestamp >= data.lastDailyResetTimestamp + 1 days) {
            return MAX_REPUTATION_GAIN_PER_PERIOD / 2;
        }
        if (data.reputationGainedToday >= MAX_REPUTATION_GAIN_PER_PERIOD) {
            return 0;
        }
        return
            (MAX_REPUTATION_GAIN_PER_PERIOD - data.reputationGainedToday) / 2;
    }

    // ============ Internal Functions ============

    function _calculateReputationScore(
        address user
    ) internal view returns (uint256) {
        ReputationData storage data = reputationData[user];
        if (data.walletCreationTime == 0) return 0;

        uint256 score = data.baseScore;

        uint256 defaultPenaltyScore = _calculateRepaymentScore(data);
        uint256 transactionScore = _calculateTransactionScore(data);
        uint256 walletAgeScore = _calculateWalletAgeScore(data);

        uint256 weightedBonus = (transactionScore *
            TRANSACTION_WEIGHT +
            walletAgeScore *
            WALLET_AGE_WEIGHT) / 80;

        uint256 weightedPenalty = (defaultPenaltyScore * REPAYMENT_WEIGHT) /
            100;

        score = (score + weightedBonus) / 2;

        if (score > weightedPenalty) {
            score -= weightedPenalty;
        } else {
            score = MIN_REPUTATION;
        }

        uint256 decayAmount = _calculateDecay(data);
        score = score > decayAmount ? score - decayAmount : MIN_REPUTATION;

        return _min(score, MAX_REPUTATION);
    }

    function _calculateRepaymentScore(
        ReputationData storage data
    ) internal view returns (uint256) {
        if (data.defaults == 0) return 0;

        uint256 defaultPenalty = data.defaults * 80;

        uint256 mitigationScore = 0;
        if (data.totalRepaymentValue > 0) {
            mitigationScore = _min(
                (data.totalRepaymentValue / 1 ether) * 2,
                60
            );
        }

        if (mitigationScore >= defaultPenalty) return 0;
        return _min(defaultPenalty - mitigationScore, 300);
    }

    function _calculateTransactionScore(
        ReputationData storage data
    ) internal view returns (uint256) {
        uint256 txScore = _min(data.totalTransactions * 2, 100);
        uint256 diversityScore = _min(data.uniqueCounterparties * 5, 100);
        uint256 valueScore = 0;
        if (data.totalValueTransferred > 0) {
            valueScore = _min((data.totalValueTransferred / 1 ether) * 3, 100);
        }
        return _min(((txScore + diversityScore + valueScore) * 2) / 3, 200);
    }

    function _calculateWalletAgeScore(
        ReputationData storage data
    ) internal view returns (uint256) {
        uint256 ageDays = (block.timestamp - data.walletCreationTime) / 1 days;
        ageDays = _min(ageDays, WALLET_AGE_CAP_DAYS);
        return (ageDays * 100) / WALLET_AGE_CAP_DAYS;
    }

    function _calculateDecay(
        ReputationData storage data
    ) internal view returns (uint256) {
        uint256 daysSinceActivity = (block.timestamp -
            data.lastActivityTimestamp) / 1 days;

        if (daysSinceActivity < DECAY_START_DAYS) return 0;

        uint256 decayDays = daysSinceActivity - DECAY_START_DAYS;

        if (decayDays >= DECAY_PERIOD_DAYS) {
            return (data.baseScore * MAX_DECAY_PERCENTAGE) / 100;
        }

        uint256 decayPercentage = (decayDays * MAX_DECAY_PERCENTAGE) /
            DECAY_PERIOD_DAYS;
        return (data.baseScore * decayPercentage) / 100;
    }

    function _calculateRepaymentBonus(
        uint256 loanAmount
    ) internal pure returns (uint256) {
        uint256 amountBonus = _min((loanAmount / 1 ether) * 2, 30);
        return SUCCESSFUL_REPAYMENT_BASE + amountBonus;
    }

    function _calculateDefaultPenalty(
        uint256 loanAmount,
        uint256 totalRepaymentValue
    ) internal pure returns (uint256) {
        uint256 basePenalty = DEFAULT_PENALTY_BASE;
        uint256 amountPenalty = _min((loanAmount / 1 ether) * 10, 100);

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

    function _calculateCoSigningBonus(
        address borrower,
        address coSigner,
        uint256 coSignerReputation
    ) internal view returns (uint256) {
        CoSigningHistory storage history = coSigningHistory[coSigner];

        uint256 baseBonus = (coSignerReputation * 10) / 100;
        baseBonus = _min(baseBonus, 50);

        if (
            block.timestamp < history.lastCoSignTime[borrower] + COSIGN_COOLDOWN
        ) {
            uint256 count = history.coSignCount[borrower];
            if (count == 0) {
                return baseBonus;
            } else if (count == 1) {
                return (baseBonus * 60) / 100;
            } else if (count == 2) {
                return (baseBonus * 30) / 100;
            } else {
                return (baseBonus * 10) / 100;
            }
        }

        return baseBonus;
    }

    function _ensureInitialized(address user) internal {
        if (reputationData[user].walletCreationTime == 0) {
            reputationData[user].baseScore = STARTING_REPUTATION;
            reputationData[user].walletCreationTime = block.timestamp;
            reputationData[user].lastActivityTimestamp = block.timestamp;
            reputationData[user].lastReputationUpdate = block.timestamp;
            reputationData[user].lastDailyResetTimestamp = block.timestamp;
        }
    }

    //Reset the daily gain counter if a new 24h window has started, then return how much of the requested gain can be applied within the cap.
    function _clampToDailyCap(
        address user,
        uint256 requestedGain
    ) internal returns (uint256) {
        ReputationData storage data = reputationData[user];

        if (block.timestamp >= data.lastDailyResetTimestamp + 1 days) {
            data.reputationGainedToday = 0;
            data.lastDailyResetTimestamp = block.timestamp;
        }

        if (data.reputationGainedToday >= MAX_REPUTATION_GAIN_PER_PERIOD) {
            return 0;
        }

        uint256 remaining = MAX_REPUTATION_GAIN_PER_PERIOD -
            data.reputationGainedToday;
        return _min(requestedGain, remaining);
    }

    // Refresh state
    function touchReputation(address user) external onlyRole(DATA_FEED_ROLE) {
        if (user == address(0)) revert ReputationManager__InvalidAddress();
        _ensureInitialized(user);
        _clampToDailyCap(user, 0); // resets reputationGainedToday if 24h elapsed
        reputationData[user].lastActivityTimestamp = block.timestamp;
    }

    //Helper: minimum of two numbers
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
