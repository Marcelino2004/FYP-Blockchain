// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ReputationManager.sol";
import "./LendingPool.sol";

/**
 * @title CoSigningManager
 * @notice Manages co-signing relationships where trusted users can vouch for borrowers
 * @dev Integrates with ReputationManager and LendingPool for reputation staking
 */
contract CoSigningManager is AccessControl, ReentrancyGuard {
    // ============ State Variables ============

    ReputationManager public immutable reputationManager;
    LendingPool public immutable lendingPool;

    // Counters
    uint256 public nextRequestId = 1;
    uint256 public nextRecordId = 1;

    // Storage
    mapping(uint256 => CoSigningRequest) public coSigningRequests;
    mapping(uint256 => CoSigningRecord) public coSigningRecords;
    mapping(uint256 => uint256[]) public loanCoSigners; // loanId => recordIds[]
    mapping(address => uint256[]) public userRequests; // borrower => requestIds[]
    mapping(address => uint256[]) public userCoSignings; // coSigner => recordIds[]

    // Co-signing limits
    uint256 public constant MIN_COSIGNER_REPUTATION = 200;
    uint256 public constant MAX_BONUS_PERCENTAGE = 50; // 50% of co-signer's reputation
    uint256 public constant COOLDOWN_PERIOD = 30 days;
    uint256 public constant MAX_COSIGNERS_PER_LOAN = 3;

    // ============ Structs ============

    struct CoSigningRequest {
        uint256 requestId;
        address borrower;
        uint256 loanOfferId;
        uint256 requestedBonus;
        bool isActive;
        uint256 createdAt;
        string message;
    }

    struct CoSigningRecord {
        uint256 recordId;
        address coSigner;
        address borrower;
        uint256 loanId;
        uint256 reputationStaked;
        uint256 bonusProvided;
        uint256 coSignTimestamp;
        bool isActive;
        bool loanCompleted;
        bool borrowerDefaulted;
    }

    // ============ Events ============

    event CoSigningRequestCreated(
        uint256 indexed requestId,
        address indexed borrower,
        uint256 indexed loanOfferId,
        uint256 requestedBonus,
        string message
    );

    event CoSigningRequestCancelled(
        uint256 indexed requestId,
        address indexed borrower
    );

    event CoSigningCompleted(
        uint256 indexed recordId,
        address indexed coSigner,
        address indexed borrower,
        uint256 loanId,
        uint256 bonusProvided
    );

    event CoSigningReleased(
        uint256 indexed recordId,
        address indexed coSigner,
        address indexed borrower,
        bool successfulRepayment
    );

    event CoSignerPenalized(
        uint256 indexed recordId,
        address indexed coSigner,
        address indexed borrower,
        uint256 penaltyAmount
    );

    event CoSignerRewarded(
        uint256 indexed recordId,
        address indexed coSigner,
        address indexed borrower,
        uint256 rewardAmount
    );

    // ============ Errors ============

    error CoSigningManager__InvalidAddress();
    error CoSigningManager__RequestNotFound();
    error CoSigningManager__RequestNotActive();
    error CoSigningManager__UnauthorizedCancellation();
    error CoSigningManager__InsufficientReputation();
    error CoSigningManager__RecordNotFound();
    error CoSigningManager__RecordNotActive();
    error CoSigningManager__MaxCoSignersReached();
    error CoSigningManager__CannotCoSignSelf();
    error CoSigningManager__LoanNotFound();
    error CoSigningManager__InvalidBonus();

    // ============ Constructor ============

    constructor(address _reputationManager, address _lendingPool) {
        if (_reputationManager == address(0) || _lendingPool == address(0)) {
            revert CoSigningManager__InvalidAddress();
        }

        reputationManager = ReputationManager(_reputationManager);
        lendingPool = LendingPool(_lendingPool);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ============ External Functions - Request Management ============

    /**
     * @notice Create a co-signing request for a loan offer
     * @param loanOfferId The ID of the loan offer
     * @param requestedBonus The reputation bonus requested
     * @param message Optional message to potential co-signers
     * @return requestId The ID of the created request
     */
    function createCoSigningRequest(
        uint256 loanOfferId,
        uint256 requestedBonus,
        string calldata message
    ) external nonReentrant returns (uint256 requestId) {
        if (requestedBonus == 0) revert CoSigningManager__InvalidBonus();

        // Verify loan offer exists
        LendingPool.LoanOffer memory offer = lendingPool.getLoanOffer(
            loanOfferId
        );
        if (offer.creator == address(0))
            revert CoSigningManager__LoanNotFound();

        requestId = nextRequestId++;

        coSigningRequests[requestId] = CoSigningRequest({
            requestId: requestId,
            borrower: msg.sender,
            loanOfferId: loanOfferId,
            requestedBonus: requestedBonus,
            isActive: true,
            createdAt: block.timestamp,
            message: message
        });

        userRequests[msg.sender].push(requestId);

        emit CoSigningRequestCreated(
            requestId,
            msg.sender,
            loanOfferId,
            requestedBonus,
            message
        );

        return requestId;
    }

    /**
     * @notice Cancel a co-signing request
     * @param requestId The ID of the request to cancel
     */
    function cancelCoSigningRequest(uint256 requestId) external nonReentrant {
        CoSigningRequest storage request = coSigningRequests[requestId];

        if (request.borrower == address(0))
            revert CoSigningManager__RequestNotFound();
        if (!request.isActive) revert CoSigningManager__RequestNotActive();
        if (request.borrower != msg.sender)
            revert CoSigningManager__UnauthorizedCancellation();

        request.isActive = false;

        emit CoSigningRequestCancelled(requestId, msg.sender);
    }

    /**
     * @notice Accept a co-signing request and stake reputation
     * @param requestId The ID of the request to accept
     * @return recordId The ID of the co-signing record
     */
    function acceptCoSigningRequest(
        uint256 requestId
    ) external nonReentrant returns (uint256 recordId) {
        CoSigningRequest storage request = coSigningRequests[requestId];

        if (request.borrower == address(0))
            revert CoSigningManager__RequestNotFound();
        if (!request.isActive) revert CoSigningManager__RequestNotActive();
        if (msg.sender == request.borrower)
            revert CoSigningManager__CannotCoSignSelf();

        // Check co-signer reputation
        uint256 coSignerReputation = reputationManager.getReputationScore(
            msg.sender
        );
        if (coSignerReputation < MIN_COSIGNER_REPUTATION) {
            revert CoSigningManager__InsufficientReputation();
        }

        // Calculate actual bonus with diminishing returns
        uint256 bonusProvided = reputationManager.addCoSigningBonus(
            request.borrower,
            msg.sender,
            coSignerReputation
        );

        recordId = nextRecordId++;

        coSigningRecords[recordId] = CoSigningRecord({
            recordId: recordId,
            coSigner: msg.sender,
            borrower: request.borrower,
            loanId: 0, // Will be set when loan is matched
            reputationStaked: coSignerReputation,
            bonusProvided: bonusProvided,
            coSignTimestamp: block.timestamp,
            isActive: true,
            loanCompleted: false,
            borrowerDefaulted: false
        });

        userCoSignings[msg.sender].push(recordId);

        // Deactivate request
        request.isActive = false;

        emit CoSigningCompleted(
            recordId,
            msg.sender,
            request.borrower,
            0,
            bonusProvided
        );

        return recordId;
    }

    /**
     * @notice Add co-signer to an active loan (called by borrower or automatically)
     * @param loanId The ID of the loan
     * @param coSignRecordId The ID of the co-signing record
     */
    function addCoSignerToLoan(
        uint256 loanId,
        uint256 coSignRecordId
    ) external nonReentrant {
        CoSigningRecord storage record = coSigningRecords[coSignRecordId];

        if (record.coSigner == address(0))
            revert CoSigningManager__RecordNotFound();
        if (!record.isActive) revert CoSigningManager__RecordNotActive();

        // Verify loan exists and borrower matches
        LendingPool.Loan memory loan = lendingPool.getLoan(loanId);
        if (loan.borrower == address(0))
            revert CoSigningManager__LoanNotFound();
        if (loan.borrower != record.borrower)
            revert CoSigningManager__InvalidAddress();

        // Check max co-signers limit
        if (loanCoSigners[loanId].length >= MAX_COSIGNERS_PER_LOAN) {
            revert CoSigningManager__MaxCoSignersReached();
        }

        // Link record to loan
        record.loanId = loanId;
        loanCoSigners[loanId].push(coSignRecordId);

        emit CoSigningCompleted(
            coSignRecordId,
            record.coSigner,
            record.borrower,
            loanId,
            record.bonusProvided
        );
    }

    /**
     * @notice Release co-signing after loan completion
     * @param recordId The ID of the co-signing record
     * @param successfulRepayment Whether the loan was repaid successfully
     */
    function releaseCoSigning(
        uint256 recordId,
        bool successfulRepayment
    ) external nonReentrant {
        CoSigningRecord storage record = coSigningRecords[recordId];

        if (record.coSigner == address(0))
            revert CoSigningManager__RecordNotFound();
        if (!record.isActive) revert CoSigningManager__RecordNotActive();

        record.isActive = false;
        record.loanCompleted = true;

        if (successfulRepayment) {
            // Reward co-signer
            reputationManager.rewardCoSigner(record.coSigner, record.borrower);

            emit CoSignerRewarded(
                recordId,
                record.coSigner,
                record.borrower,
                10
            );
        } else {
            // Penalize co-signer
            record.borrowerDefaulted = true;

            // Calculate penalty amount (done by ReputationManager)
            reputationManager.penalizeCoSigner(
                record.coSigner,
                record.borrower,
                record.reputationStaked
            );

            emit CoSignerPenalized(
                recordId,
                record.coSigner,
                record.borrower,
                record.reputationStaked / 3
            );
        }

        emit CoSigningReleased(
            recordId,
            record.coSigner,
            record.borrower,
            successfulRepayment
        );
    }

    // ============ View Functions ============

    /**
     * @notice Calculate co-signing bonus for a borrower-coSigner pair
     * @param borrower The address of the borrower
     * @param coSigner The address of the co-signer
     * @return bonus The calculated bonus amount
     */
    function calculateCoSigningBonus(
        address borrower,
        address coSigner
    ) external view returns (uint256 bonus) {
        uint256 coSignerReputation = reputationManager.getReputationScore(
            coSigner
        );

        // Base bonus: up to 50% of co-signer's reputation
        uint256 baseBonus = (coSignerReputation * MAX_BONUS_PERCENTAGE) / 100;

        // Apply diminishing returns based on history
        uint256 coSignCount = reputationManager.getCoSignCount(
            coSigner,
            borrower
        );

        if (coSignCount == 0) {
            return baseBonus; // 100%
        } else if (coSignCount == 1) {
            return (baseBonus * 60) / 100; // 60%
        } else if (coSignCount == 2) {
            return (baseBonus * 30) / 100; // 30%
        } else {
            return (baseBonus * 10) / 100; // 10%
        }
    }

    /**
     * @notice Get co-signing record details
     * @param recordId The ID of the co-signing record
     * @return record The CoSigningRecord struct
     */
    function getCoSigningRecord(
        uint256 recordId
    ) external view returns (CoSigningRecord memory) {
        return coSigningRecords[recordId];
    }

    /**
     * @notice Get co-signing request details
     * @param requestId The ID of the request
     * @return request The CoSigningRequest struct
     */
    function getCoSigningRequest(
        uint256 requestId
    ) external view returns (CoSigningRequest memory) {
        return coSigningRequests[requestId];
    }

    /**
     * @notice Get all co-signing requests for a borrower
     * @param borrower The address of the borrower
     * @return requests Array of request IDs
     */
    function getCoSigningRequests(
        address borrower
    ) external view returns (uint256[] memory) {
        return userRequests[borrower];
    }

    /**
     * @notice Get all active co-signing requests for a borrower
     * @param borrower The address of the borrower
     * @return activeRequests Array of CoSigningRequest structs
     */
    function getActiveCoSigningRequests(
        address borrower
    ) external view returns (CoSigningRequest[] memory) {
        uint256[] memory requestIds = userRequests[borrower];
        uint256 activeCount = 0;

        // Count active requests
        for (uint256 i = 0; i < requestIds.length; i++) {
            if (coSigningRequests[requestIds[i]].isActive) {
                activeCount++;
            }
        }

        // Build array
        CoSigningRequest[] memory activeRequests = new CoSigningRequest[](
            activeCount
        );
        uint256 index = 0;

        for (uint256 i = 0; i < requestIds.length; i++) {
            if (coSigningRequests[requestIds[i]].isActive) {
                activeRequests[index] = coSigningRequests[requestIds[i]];
                index++;
            }
        }

        return activeRequests;
    }

    /**
     * @notice Get all co-signing records for a user (as co-signer)
     * @param coSigner The address of the co-signer
     * @return records Array of record IDs
     */
    function getUserCoSignings(
        address coSigner
    ) external view returns (uint256[] memory) {
        return userCoSignings[coSigner];
    }

    /**
     * @notice Get all active co-signing records for a user
     * @param user The address of the user
     * @return activeRecords Array of CoSigningRecord structs
     */
    function getActiveCoSignings(
        address user
    ) external view returns (CoSigningRecord[] memory) {
        uint256[] memory recordIds = userCoSignings[user];
        uint256 activeCount = 0;

        // Count active records
        for (uint256 i = 0; i < recordIds.length; i++) {
            if (coSigningRecords[recordIds[i]].isActive) {
                activeCount++;
            }
        }

        // Build array
        CoSigningRecord[] memory activeRecords = new CoSigningRecord[](
            activeCount
        );
        uint256 index = 0;

        for (uint256 i = 0; i < recordIds.length; i++) {
            if (coSigningRecords[recordIds[i]].isActive) {
                activeRecords[index] = coSigningRecords[recordIds[i]];
                index++;
            }
        }

        return activeRecords;
    }

    /**
     * @notice Get all co-signers for a loan
     * @param loanId The ID of the loan
     * @return coSigners Array of co-signer addresses
     */
    function getLoanCoSigners(
        uint256 loanId
    ) external view returns (address[] memory) {
        uint256[] memory recordIds = loanCoSigners[loanId];
        address[] memory coSigners = new address[](recordIds.length);

        for (uint256 i = 0; i < recordIds.length; i++) {
            coSigners[i] = coSigningRecords[recordIds[i]].coSigner;
        }

        return coSigners;
    }

    /**
     * @notice Get total reputation bonus provided to a borrower for a loan
     * @param loanId The ID of the loan
     * @return totalBonus The total bonus from all co-signers
     */
    function getLoanTotalBonus(
        uint256 loanId
    ) external view returns (uint256 totalBonus) {
        uint256[] memory recordIds = loanCoSigners[loanId];

        for (uint256 i = 0; i < recordIds.length; i++) {
            totalBonus += coSigningRecords[recordIds[i]].bonusProvided;
        }

        return totalBonus;
    }

    /**
     * @notice Check how many times a co-signer has co-signed for a borrower
     * @param coSigner The address of the co-signer
     * @param borrower The address of the borrower
     * @return count The number of times co-signed
     */
    function getCoSignCount(
        address coSigner,
        address borrower
    ) external view returns (uint256) {
        return reputationManager.getCoSignCount(coSigner, borrower);
    }

    /**
     * @notice Check if diminishing returns apply for a co-signer-borrower pair
     * @param coSigner The address of the co-signer
     * @param borrower The address of the borrower
     * @return hasDR True if diminishing returns apply
     */
    function hasDiminishingReturns(
        address coSigner,
        address borrower
    ) external view returns (bool) {
        return reputationManager.hasDiminishingReturns(coSigner, borrower);
    }

    /**
     * @notice Get co-signing statistics for a user
     * @param user The address of the user
     * @return totalCoSignings Total number of co-signings
     * @return activeCoSignings Current active co-signings
     * @return successfulCoSignings Successful completions
     * @return defaultedCoSignings Defaulted loans
     */
    function getCoSigningStats(
        address user
    )
        external
        view
        returns (
            uint256 totalCoSignings,
            uint256 activeCoSignings,
            uint256 successfulCoSignings,
            uint256 defaultedCoSignings
        )
    {
        uint256[] memory recordIds = userCoSignings[user];

        totalCoSignings = recordIds.length;

        for (uint256 i = 0; i < recordIds.length; i++) {
            CoSigningRecord memory record = coSigningRecords[recordIds[i]];

            if (record.isActive) {
                activeCoSignings++;
            } else if (record.loanCompleted) {
                if (record.borrowerDefaulted) {
                    defaultedCoSignings++;
                } else {
                    successfulCoSignings++;
                }
            }
        }

        return (
            totalCoSignings,
            activeCoSignings,
            successfulCoSignings,
            defaultedCoSignings
        );
    }

    /**
     * @notice Get all open co-signing requests (for discovery)
     * @return openRequests Array of active CoSigningRequest structs
     */
    function getAllOpenRequests()
        external
        view
        returns (CoSigningRequest[] memory)
    {
        uint256 totalRequests = nextRequestId - 1;
        uint256 openCount = 0;

        // Count open requests
        for (uint256 i = 1; i <= totalRequests; i++) {
            if (coSigningRequests[i].isActive) {
                openCount++;
            }
        }

        // Build array
        CoSigningRequest[] memory openRequests = new CoSigningRequest[](
            openCount
        );
        uint256 index = 0;

        for (uint256 i = 1; i <= totalRequests; i++) {
            if (coSigningRequests[i].isActive) {
                openRequests[index] = coSigningRequests[i];
                index++;
            }
        }

        return openRequests;
    }
}
