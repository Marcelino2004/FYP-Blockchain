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

    bytes32 public constant LENDING_POOL_ROLE = keccak256("LENDING_POOL_ROLE");

    // Counters
    uint256 public nextRequestId = 1;
    uint256 public nextRecordId = 1;

    // Storage
    mapping(uint256 => CoSigningRequest) public coSigningRequests;
    mapping(uint256 => CoSigningRecord) public coSigningRecords;
    mapping(uint256 => uint256[]) public loanCoSigners; // loanId      => recordIds[]
    mapping(address => uint256[]) public userRequests; // borrower    => requestIds[]
    mapping(address => uint256[]) public userCoSignings; // coSigner    => recordIds[]
    mapping(uint256 => address) public offerCoSigner;
    mapping(uint256 => uint256) public offerToCoSignRecord;
    mapping(uint256 => bool) public offerHasActiveRequest;

    // ← NEW: index accepted records by their originating loan offer so that
    //   LendingPool.cancelLoanOffer can find and reverse them.
    mapping(uint256 => uint256[]) public offerToRecords; // loanOfferId => recordIds[]

    // Co-signing limits
    uint256 public constant MIN_COSIGNER_REPUTATION = 50; //to be changed back to 200
    uint256 public constant MAX_BONUS_PERCENTAGE = 50;
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
        uint256 loanOfferId;
        uint256 reputationStaked;
        uint256 bonusProvided;
        uint256 coSignTimestamp;
        bool isActive;
        bool loanCompleted;
        bool borrowerDefaulted;
        bool wasCancelled;
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

    // ← NEW
    event CoSigningRecordCancelled(
        uint256 indexed recordId,
        address indexed coSigner,
        address indexed borrower
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
    error CoSigningManager__RecordAlreadyLinked();
    error CoSigningManager__CoSignerCannotBeLender();
    error CoSigningManager__RequestAlreadyExists();
    error CoSigningManager__AlreadyCoSigned();

    // ============ Constructor ============

    constructor(address _reputationManager, address _lendingPool) {
        if (_reputationManager == address(0) || _lendingPool == address(0)) {
            revert CoSigningManager__InvalidAddress();
        }

        reputationManager = ReputationManager(_reputationManager);
        lendingPool = LendingPool(_lendingPool);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(LENDING_POOL_ROLE, _lendingPool);
    }

    // ============ External Functions - Request Management ============

    /**
     * @notice Create a co-signing request for a loan offer
     * @param loanOfferId The ID of the loan offer
     * @param requestedBonus Stored for display only — has no on-chain effect
     * @param message Optional message to potential co-signers
     * @return requestId The ID of the created request
     */
    function createCoSigningRequest(
        uint256 loanOfferId,
        uint256 requestedBonus,
        string calldata message
    ) external nonReentrant returns (uint256 requestId) {
        if (requestedBonus == 0) revert CoSigningManager__InvalidBonus();

        LendingPool.LoanOffer memory offer = lendingPool.getLoanOffer(
            loanOfferId
        );
        if (offer.creator == address(0))
            revert CoSigningManager__LoanNotFound();

        // Only the offer creator can request co-signing for their own offer
        if (offer.creator != msg.sender)
            revert CoSigningManager__UnauthorizedCancellation();

        // Block duplicate active requests for the same offer
        if (offerHasActiveRequest[loanOfferId])
            revert CoSigningManager__RequestAlreadyExists();

        // Block if already co-signed (accepted)
        if (offerCoSigner[loanOfferId] != address(0))
            revert CoSigningManager__AlreadyCoSigned();

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
        offerHasActiveRequest[loanOfferId] = true;

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
     * @notice Cancel a co-signing REQUEST (before anyone has accepted it).
     * @dev No reputation has been applied yet at this stage — no reversal needed.
     *      Only the borrower who created the request can call this.
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
        delete offerCoSigner[request.loanOfferId];
        offerHasActiveRequest[request.loanOfferId] = false;
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

        uint256 coSignerReputation = reputationManager.getReputationScore(
            msg.sender
        );
        if (coSignerReputation < MIN_COSIGNER_REPUTATION) {
            revert CoSigningManager__InsufficientReputation();
        }

        // Actual bonus determined by ReputationManager — requestedBonus is ignored here
        uint256 bonusProvided = reputationManager.addCoSigningBonus(
            request.borrower,
            msg.sender,
            coSignerReputation,
            request.loanOfferId
        );

        recordId = nextRecordId++;

        coSigningRecords[recordId] = CoSigningRecord({
            recordId: recordId,
            coSigner: msg.sender,
            borrower: request.borrower,
            loanId: 0,
            loanOfferId: request.loanOfferId,
            reputationStaked: coSignerReputation,
            bonusProvided: bonusProvided,
            coSignTimestamp: block.timestamp,
            isActive: true,
            loanCompleted: false,
            borrowerDefaulted: false,
            wasCancelled: false
        });

        userCoSignings[msg.sender].push(recordId);

        //   look up this record by offer ID and reverse the bonus if needed.
        offerToRecords[request.loanOfferId].push(recordId);

        offerCoSigner[request.loanOfferId] = msg.sender;

        offerToCoSignRecord[request.loanOfferId] = recordId;

        // Deactivate the request — one co-signer per request
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
     * @notice Cancel an active co-signing RECORD when the underlying loan offer
     *         is cancelled by the borrower before a lender accepts it.
     * @dev Reverses the reputation bonus given to the borrower and decrements
     *      the co-signer's active count. Called by LendingPool (which holds
     *      DEFAULT_ADMIN_ROLE) or directly by the borrower.
     * @param recordId The ID of the co-signing record to cancel
     */
    function cancelCoSigningRecord(uint256 recordId) external nonReentrant {
        CoSigningRecord storage record = coSigningRecords[recordId];

        if (record.coSigner == address(0))
            revert CoSigningManager__RecordNotFound();
        if (!record.isActive) revert CoSigningManager__RecordNotActive();

        // Only the borrower or LendingPool (admin) can cancel
        if (
            msg.sender != record.borrower &&
            !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)
        ) {
            revert CoSigningManager__UnauthorizedCancellation();
        }

        record.isActive = false;
        record.loanCompleted = true;
        record.wasCancelled = true;

        // Reverse the reputation bonus given to the borrower
        reputationManager.clearOfferCoSigningBonus(
            record.borrower,
            record.loanOfferId
        );

        // Decrement the co-signer's active co-sign count
        reputationManager.decrementActiveCoSigns(record.coSigner);

        emit CoSigningRecordCancelled(
            recordId,
            record.coSigner,
            record.borrower
        );
        emit CoSigningReleased(
            recordId,
            record.coSigner,
            record.borrower,
            false
        );
    }

    /**
     * @notice Add co-signer to an active loan (called by borrower after loan is matched)
     * @param loanId The ID of the matched loan
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

        LendingPool.Loan memory loan = lendingPool.getLoan(loanId);
        if (loan.borrower == address(0))
            revert CoSigningManager__LoanNotFound();
        if (loan.borrower != record.borrower)
            revert CoSigningManager__InvalidAddress();

        if (loan.lender == record.coSigner)
            revert CoSigningManager__CoSignerCannotBeLender();

        if (loanCoSigners[loanId].length >= MAX_COSIGNERS_PER_LOAN) {
            revert CoSigningManager__MaxCoSignersReached();
        }

        record.loanId = loanId;
        loanCoSigners[loanId].push(coSignRecordId);

        reputationManager.applyOfferCoSigningBonus(
            record.borrower,
            record.loanOfferId
        );

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
     * @param successfulRepayment true = repaid, false = defaulted
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

        // Clear the borrower's co-signing bonus on release
        reputationManager.clearOfferCoSigningBonus(
            record.borrower,
            record.loanOfferId
        );

        if (successfulRepayment) {
            reputationManager.rewardCoSigner(record.coSigner, record.borrower);
            emit CoSignerRewarded(
                recordId,
                record.coSigner,
                record.borrower,
                10
            );
        } else {
            record.borrowerDefaulted = true;
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

    /**
     * @notice Link a co-signing record to a matched loan (called by LendingPool)
     * @param recordId The co-signing record ID
     * @param loanId The matched loan ID
     */
    function linkRecordToLoan(
        uint256 recordId,
        uint256 loanId
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        CoSigningRecord storage record = coSigningRecords[recordId];

        if (record.coSigner == address(0))
            revert CoSigningManager__RecordNotFound();
        if (!record.isActive) revert CoSigningManager__RecordNotActive();
        if (record.loanId != 0) revert CoSigningManager__RecordAlreadyLinked(); // NEW ERROR

        record.loanId = loanId;
        loanCoSigners[loanId].push(recordId);

        emit CoSigningCompleted(
            recordId,
            record.coSigner,
            record.borrower,
            loanId,
            record.bonusProvided
        );
    }

    // ============ View Functions ============

    /**
     * @notice Get all record IDs for a given loan offer.
     * @dev Populated in acceptCoSigningRequest. Used by LendingPool.cancelLoanOffer.
     */
    function getRecordsByOffer(
        uint256 loanOfferId
    ) external view returns (uint256[] memory) {
        return offerToRecords[loanOfferId];
    }

    /**
     * @notice Calculate co-signing bonus preview for a borrower/coSigner pair
     */
    function calculateCoSigningBonus(
        address borrower,
        address coSigner
    ) external view returns (uint256 bonus) {
        uint256 coSignerReputation = reputationManager.getReputationScore(
            coSigner
        );
        uint256 baseBonus = (coSignerReputation * MAX_BONUS_PERCENTAGE) / 100;
        uint256 coSignCount = reputationManager.getCoSignCount(
            coSigner,
            borrower
        );

        if (coSignCount == 0) {
            return baseBonus;
        } else if (coSignCount == 1) {
            return (baseBonus * 60) / 100;
        } else if (coSignCount == 2) {
            return (baseBonus * 30) / 100;
        } else {
            return (baseBonus * 10) / 100;
        }
    }

    function handleOfferCancelled(
        uint256 loanOfferId,
        address borrower
    ) external onlyRole(LENDING_POOL_ROLE) {
        reputationManager.clearOfferCoSigningBonus(borrower, loanOfferId);

        uint256 recordId = offerToCoSignRecord[loanOfferId];
        if (recordId != 0) {
            CoSigningRecord storage record = coSigningRecords[recordId];
            if (record.isActive) {
                record.isActive = false;
                reputationManager.decrementActiveCoSigns(record.coSigner);
                emit CoSigningReleased(
                    recordId,
                    record.coSigner,
                    borrower,
                    false
                );
            }
        }

        delete offerCoSigner[loanOfferId];
        delete offerToCoSignRecord[loanOfferId];
    }

    /**
     * @notice Get co-signing record details
     */
    function getCoSigningRecord(
        uint256 recordId
    ) external view returns (CoSigningRecord memory) {
        return coSigningRecords[recordId];
    }

    /**
     * @notice Get co-signing request details
     */
    function getCoSigningRequest(
        uint256 requestId
    ) external view returns (CoSigningRequest memory) {
        return coSigningRequests[requestId];
    }

    /**
     * @notice Get all request IDs for a borrower
     */
    function getCoSigningRequests(
        address borrower
    ) external view returns (uint256[] memory) {
        return userRequests[borrower];
    }

    /**
     * @notice Get all active requests for a borrower as full structs
     */
    function getActiveCoSigningRequests(
        address borrower
    ) external view returns (CoSigningRequest[] memory) {
        uint256[] memory requestIds = userRequests[borrower];
        uint256 activeCount = 0;

        for (uint256 i = 0; i < requestIds.length; i++) {
            if (coSigningRequests[requestIds[i]].isActive) activeCount++;
        }

        CoSigningRequest[] memory activeRequests = new CoSigningRequest[](
            activeCount
        );
        uint256 index = 0;

        for (uint256 i = 0; i < requestIds.length; i++) {
            if (coSigningRequests[requestIds[i]].isActive) {
                activeRequests[index++] = coSigningRequests[requestIds[i]];
            }
        }

        return activeRequests;
    }

    /**
     * @notice Get all record IDs for a co-signer
     */
    function getUserCoSignings(
        address coSigner
    ) external view returns (uint256[] memory) {
        return userCoSignings[coSigner];
    }

    /**
     * @notice Get all active records for a user as full structs
     */
    function getActiveCoSignings(
        address user
    ) external view returns (CoSigningRecord[] memory) {
        uint256[] memory recordIds = userCoSignings[user];
        uint256 activeCount = 0;

        for (uint256 i = 0; i < recordIds.length; i++) {
            if (coSigningRecords[recordIds[i]].isActive) activeCount++;
        }

        CoSigningRecord[] memory activeRecords = new CoSigningRecord[](
            activeCount
        );
        uint256 index = 0;

        for (uint256 i = 0; i < recordIds.length; i++) {
            if (coSigningRecords[recordIds[i]].isActive) {
                activeRecords[index++] = coSigningRecords[recordIds[i]];
            }
        }

        return activeRecords;
    }

    /**
     * @notice Check if diminishing returns apply for a pair
     */
    function hasDiminishingReturns(
        address coSigner,
        address borrower
    ) external view returns (bool) {
        return reputationManager.hasDiminishingReturns(coSigner, borrower);
    }

    /**
     * @notice Get co-signing statistics for a user
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
                } else if (!record.wasCancelled) {
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
     * @notice Get all open co-signing requests across all borrowers (for the discovery page)
     */
    function getAllOpenRequests()
        external
        view
        returns (CoSigningRequest[] memory)
    {
        uint256 totalRequests = nextRequestId - 1;
        uint256 openCount = 0;

        for (uint256 i = 1; i <= totalRequests; i++) {
            if (coSigningRequests[i].isActive) openCount++;
        }

        CoSigningRequest[] memory openRequests = new CoSigningRequest[](
            openCount
        );
        uint256 index = 0;

        for (uint256 i = 1; i <= totalRequests; i++) {
            if (coSigningRequests[i].isActive) {
                openRequests[index++] = coSigningRequests[i];
            }
        }

        return openRequests;
    }

    /**
     * @notice Get all co-signing record IDs for a loan
     * @param loanId The loan ID
     * @return Array of co-signing record IDs
     */
    function getLoanCoSigners(
        uint256 loanId
    ) external view returns (uint256[] memory) {
        return loanCoSigners[loanId];
    }

    function isCoSignerForOffer(
        uint256 loanOfferId,
        address account
    ) external view returns (bool) {
        return offerCoSigner[loanOfferId] == account;
    }
}
