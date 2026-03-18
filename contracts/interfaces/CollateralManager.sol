// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./PriceOracle.sol";

/**
 * @title CollateralManager
 * @notice Manages collateral deposits, withdrawals, and liquidations for lending platform
 * @dev Integrates with PriceOracle for real-time collateral valuation
 */
contract CollateralManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    bytes32 public constant LENDING_POOL_ROLE = keccak256("LENDING_POOL_ROLE");
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");

    PriceOracle public immutable priceOracle;

    // Collateral deposits
    mapping(uint256 => CollateralDeposit) public deposits;
    mapping(uint256 => uint256[]) public loanToDepositIds; // loanId => depositIds[]
    mapping(address => uint256[]) public userDepositIds; // user => depositIds[]

    // Token information
    mapping(address => TokenInfo) public supportedTokens;
    mapping(address => uint8) public tokenDecimals;
    address[] public supportedTokenList;

    // Counters
    uint256 public nextDepositId;

    // Liquidation parameters
    uint256 public constant LIQUIDATION_THRESHOLD = 11000; // 110% (in basis points)
    uint256 public constant MIN_COLLATERAL_RATIO = 12000; // 120% (in basis points)
    uint256 public constant LIQUIDATION_BONUS = 500; // 5% bonus for liquidators
    uint256 public constant BASIS_POINTS = 10000; // 100%

    // Grace period before liquidation (to give borrower time to add collateral)
    uint256 public constant LIQUIDATION_GRACE_PERIOD = 1 hours;

    // ============ Structs ============

    struct CollateralDeposit {
        uint256 depositId;
        address depositor;
        address tokenAddress;
        uint256 amount;
        uint256 loanId;
        bool isLocked;
        uint256 depositTimestamp;
        uint256 lockedTimestamp;
    }

    struct TokenInfo {
        bool isSupported;
        uint256 maxDepositAmount; // Max amount that can be deposited
        uint256 liquidationPenalty; // Penalty on liquidation (basis points)
        uint256 totalDeposited; // Total amount currently deposited
    }

    struct CollateralValue {
        address tokenAddress;
        uint256 amount;
        uint256 valueInUSD;
        uint256 lastUpdated;
    }

    // ============ Events ============

    event CollateralDeposited(
        uint256 indexed depositId,
        address indexed depositor,
        uint256 indexed loanId,
        address tokenAddress,
        uint256 amount,
        uint256 timestamp
    );

    event CollateralWithdrawn(
        uint256 indexed depositId,
        address indexed depositor,
        address tokenAddress,
        uint256 amount
    );

    event CollateralLocked(
        uint256 indexed depositId,
        uint256 indexed loanId,
        address tokenAddress,
        uint256 amount,
        uint256 timestamp
    );

    event CollateralUnlocked(
        uint256 indexed depositId,
        uint256 indexed loanId,
        address tokenAddress,
        uint256 amount
    );

    event CollateralLiquidated(
        uint256 indexed depositId,
        uint256 indexed loanId,
        address indexed borrower,
        address liquidator,
        address tokenAddress,
        uint256 amount,
        uint256 recoveredValue
    );

    event TokenAdded(
        address indexed token,
        uint256 maxDepositAmount,
        uint256 liquidationPenalty
    );

    event TokenRemoved(address indexed token);

    event TokenConfigUpdated(
        address indexed token,
        uint256 maxDepositAmount,
        uint256 liquidationPenalty
    );

    // ============ Errors ============

    error CollateralManager__InvalidToken();
    error CollateralManager__TokenNotSupported();
    error CollateralManager__InvalidAmount();
    error CollateralManager__DepositNotFound();
    error CollateralManager__DepositLocked();
    error CollateralManager__DepositNotLocked();
    error CollateralManager__UnauthorizedWithdrawal();
    error CollateralManager__InsufficientCollateral();
    error CollateralManager__CannotLiquidate();
    error CollateralManager__ZeroAddress();
    error CollateralManager__MaxDepositExceeded();
    error CollateralManager__TransferFailed();
    error CollateralManager__GracePeriodActive();

    // ============ Constructor ============

    constructor(address _priceOracle) {
        if (_priceOracle == address(0)) revert CollateralManager__ZeroAddress();

        priceOracle = PriceOracle(_priceOracle);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(LIQUIDATOR_ROLE, msg.sender);

        nextDepositId = 1;
    }

    // ============ External Functions ============

    /**
     * @notice Add a supported collateral token
     * @param token The token address
     * @param decimals_ The token decimals
     * @param maxDepositAmount Maximum deposit amount
     * @param liquidationPenalty Liquidation penalty in basis points
     */
    function addSupportedToken(
        address token,
        uint8 decimals_,
        uint256 maxDepositAmount,
        uint256 liquidationPenalty
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert CollateralManager__ZeroAddress();
        if (supportedTokens[token].isSupported)
            revert CollateralManager__InvalidToken();

        // Verify token is supported by price oracle
        if (!priceOracle.isSupportedToken(token)) {
            revert CollateralManager__TokenNotSupported();
        }

        supportedTokens[token] = TokenInfo({
            isSupported: true,
            maxDepositAmount: maxDepositAmount,
            liquidationPenalty: liquidationPenalty,
            totalDeposited: 0
        });

        tokenDecimals[token] = decimals_;
        supportedTokenList.push(token);

        emit TokenAdded(token, maxDepositAmount, liquidationPenalty);
    }

    /**
     * @notice Remove a supported token
     * @param token The token address
     */
    function removeSupportedToken(
        address token
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!supportedTokens[token].isSupported) {
            revert CollateralManager__TokenNotSupported();
        }

        // Check no active deposits
        if (supportedTokens[token].totalDeposited > 0) {
            revert CollateralManager__InvalidToken();
        }

        supportedTokens[token].isSupported = false;

        // Remove from list
        for (uint256 i = 0; i < supportedTokenList.length; i++) {
            if (supportedTokenList[i] == token) {
                supportedTokenList[i] = supportedTokenList[
                    supportedTokenList.length - 1
                ];
                supportedTokenList.pop();
                break;
            }
        }

        emit TokenRemoved(token);
    }

    /**
     * @notice Update token configuration
     * @param token The token address
     * @param maxDepositAmount New max deposit amount
     * @param liquidationPenalty New liquidation penalty
     */
    function updateTokenConfig(
        address token,
        uint256 maxDepositAmount,
        uint256 liquidationPenalty
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!supportedTokens[token].isSupported) {
            revert CollateralManager__TokenNotSupported();
        }

        supportedTokens[token].maxDepositAmount = maxDepositAmount;
        supportedTokens[token].liquidationPenalty = liquidationPenalty;

        emit TokenConfigUpdated(token, maxDepositAmount, liquidationPenalty);
    }

    /**
     * @notice Deposit collateral for a loan
     * @param loanId The ID of the loan
     * @param tokenAddress The address of the collateral token
     * @param amount The amount to deposit
     * @return depositId The ID of the created deposit
     */
    function depositCollateral(
        uint256 loanId,
        address tokenAddress,
        uint256 amount
    ) external nonReentrant returns (uint256 depositId) {
        if (!supportedTokens[tokenAddress].isSupported) {
            revert CollateralManager__TokenNotSupported();
        }
        if (amount == 0) revert CollateralManager__InvalidAmount();

        TokenInfo storage tokenInfo = supportedTokens[tokenAddress];

        // Check max deposit
        if (amount > tokenInfo.maxDepositAmount) {
            revert CollateralManager__MaxDepositExceeded();
        }

        depositId = nextDepositId++;

        deposits[depositId] = CollateralDeposit({
            depositId: depositId,
            depositor: msg.sender,
            tokenAddress: tokenAddress,
            amount: amount,
            loanId: loanId,
            isLocked: false,
            depositTimestamp: block.timestamp,
            lockedTimestamp: 0
        });

        loanToDepositIds[loanId].push(depositId);
        userDepositIds[msg.sender].push(depositId);

        tokenInfo.totalDeposited += amount;

        // Transfer tokens from user to this contract
        IERC20(tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        emit CollateralDeposited(
            depositId,
            msg.sender,
            loanId,
            tokenAddress,
            amount,
            block.timestamp
        );

        return depositId;
    }

    /**
     * @notice Withdraw unlocked collateral
     * @param depositId The ID of the deposit to withdraw
     */
    function withdrawCollateral(uint256 depositId) external nonReentrant {
        CollateralDeposit storage deposit = deposits[depositId];

        if (deposit.depositor == address(0))
            revert CollateralManager__DepositNotFound();
        if (deposit.depositor != msg.sender)
            revert CollateralManager__UnauthorizedWithdrawal();
        if (deposit.isLocked) revert CollateralManager__DepositLocked();

        address token = deposit.tokenAddress;
        uint256 amount = deposit.amount;
        address depositor = deposit.depositor;

        // Update state
        supportedTokens[token].totalDeposited -= amount;
        delete deposits[depositId];

        // Transfer tokens back to user
        IERC20(token).safeTransfer(depositor, amount);

        emit CollateralWithdrawn(depositId, depositor, token, amount);
    }

    /**
     * @notice Lock collateral when loan becomes active (called by LendingPool)
     * @param depositId The ID of the deposit to lock
     * @param loanId The ID of the loan
     */
    function lockCollateral(
        uint256 depositId,
        uint256 loanId
    ) external onlyRole(LENDING_POOL_ROLE) nonReentrant {
        CollateralDeposit storage deposit = deposits[depositId];

        if (deposit.depositor == address(0))
            revert CollateralManager__DepositNotFound();
        if (deposit.isLocked) revert CollateralManager__DepositLocked();
        if (deposit.loanId != loanId) revert CollateralManager__InvalidAmount();

        deposit.isLocked = true;
        deposit.lockedTimestamp = block.timestamp;

        emit CollateralLocked(
            depositId,
            loanId,
            deposit.tokenAddress,
            deposit.amount,
            block.timestamp
        );
    }

    /**
     * @notice Unlock collateral after successful repayment (called by LendingPool)
     * @param depositId The ID of the deposit to unlock
     */
    function unlockCollateral(
        uint256 depositId
    ) external onlyRole(LENDING_POOL_ROLE) nonReentrant {
        CollateralDeposit storage deposit = deposits[depositId];

        if (deposit.depositor == address(0))
            revert CollateralManager__DepositNotFound();
        if (!deposit.isLocked) revert CollateralManager__DepositNotLocked();

        deposit.isLocked = false;

        emit CollateralUnlocked(
            depositId,
            deposit.loanId,
            deposit.tokenAddress,
            deposit.amount
        );
    }

    /**
     * @notice Liquidate collateral for a defaulted loan
     * @param loanId The ID of the defaulted loan
     * @param loanAmount The outstanding loan amount in USD (18 decimals)
     * @param lender The address of the lender to receive funds
     * @return recoveredAmount The amount recovered from liquidation in USD
     */
    function liquidateCollateral(
        uint256 loanId,
        uint256 loanAmount,
        address lender,
        bool enforceGracePeriod
    )
        external
        onlyRole(LENDING_POOL_ROLE)
        nonReentrant
        returns (uint256 recoveredAmount)
    {
        if (lender == address(0)) revert CollateralManager__ZeroAddress();

        uint256[] memory depositIds = loanToDepositIds[loanId];
        if (depositIds.length == 0)
            revert CollateralManager__InsufficientCollateral();

        uint256 totalRecovered = 0;

        for (uint256 i = 0; i < depositIds.length; i++) {
            CollateralDeposit storage deposit = deposits[depositIds[i]];

            if (!deposit.isLocked) continue;

            // Check grace period
            if (
                enforceGracePeriod &&
                block.timestamp <
                deposit.lockedTimestamp + LIQUIDATION_GRACE_PERIOD
            ) {
                revert CollateralManager__GracePeriodActive();
            }

            // Get collateral value in usd
            uint256 collateralValue = priceOracle.getTokenValueInUSD(
                deposit.tokenAddress,
                deposit.amount,
                tokenDecimals[deposit.tokenAddress]
            );

            // Calculate how much USD value the lender needs:
            // unpaid amount + 5% liquidation bonus
            uint256 lenderEntitlement = (loanAmount *
                (BASIS_POINTS + LIQUIDATION_BONUS)) / BASIS_POINTS;

            uint256 lenderTokenAmount;
            uint256 borrowerTokenAmount;

            if (collateralValue <= lenderEntitlement) {
                // Collateral is not enough to cover full entitlement
                // Lender gets everything
                lenderTokenAmount = deposit.amount;
                borrowerTokenAmount = 0;
            } else {
                // Collateral covers lender entitlement — return remainder to borrower
                // lenderTokenAmount = deposit.amount * (lenderEntitlement / collateralValue)
                lenderTokenAmount =
                    (deposit.amount * lenderEntitlement) /
                    collateralValue;
                borrowerTokenAmount = deposit.amount - lenderTokenAmount;
            }

            totalRecovered +=
                (lenderTokenAmount * collateralValue) /
                deposit.amount;

            // Transfer lender's portion
            IERC20(deposit.tokenAddress).safeTransfer(
                lender,
                lenderTokenAmount
            );

            // Return remainder to borrower if any
            if (borrowerTokenAmount > 0) {
                IERC20(deposit.tokenAddress).safeTransfer(
                    deposit.depositor,
                    borrowerTokenAmount
                );
            }

            // Update state
            supportedTokens[deposit.tokenAddress].totalDeposited -= deposit
                .amount;

            emit CollateralLiquidated(
                depositIds[i],
                loanId,
                deposit.depositor,
                lender,
                deposit.tokenAddress,
                deposit.amount,
                totalRecovered
            );

            delete deposits[depositIds[i]];
        }

        // Clear loan deposits
        delete loanToDepositIds[loanId];

        return totalRecovered;
    }

    /**
     * @notice Get the USD value of collateral for a loan
     * @param loanId The ID of the loan
     * @return valueInUSD The total collateral value in USD (18 decimals)
     */
    function getLoanCollateralValue(
        uint256 loanId
    ) external view returns (uint256 valueInUSD) {
        uint256[] memory depositIds = loanToDepositIds[loanId];
        uint256 totalValue = 0;

        for (uint256 i = 0; i < depositIds.length; i++) {
            CollateralDeposit memory deposit = deposits[depositIds[i]];

            if (deposit.amount > 0) {
                uint256 value = priceOracle.getTokenValueInUSD(
                    deposit.tokenAddress,
                    deposit.amount,
                    tokenDecimals[deposit.tokenAddress]
                );
                totalValue += value;
            }
        }

        return totalValue;
    }

    /**
     * @notice Get collateral deposit details
     * @param depositId The ID of the deposit
     * @return deposit The collateral deposit struct
     */
    function getCollateralDeposit(
        uint256 depositId
    ) external view returns (CollateralDeposit memory) {
        return deposits[depositId];
    }

    /**
     * @notice Get all collateral deposits for a loan
     * @param loanId The ID of the loan
     * @return loanDeposits Array of collateral deposits
     */
    function getLoanCollateral(
        uint256 loanId
    ) external view returns (CollateralDeposit[] memory) {
        uint256[] memory depositIds = loanToDepositIds[loanId];
        CollateralDeposit[] memory loanDeposits = new CollateralDeposit[](
            depositIds.length
        );

        for (uint256 i = 0; i < depositIds.length; i++) {
            loanDeposits[i] = deposits[depositIds[i]];
        }

        return loanDeposits;
    }

    /**
     * @notice Get all deposits for a user
     * @param user The user address
     * @return userDeposits Array of user's deposits
     */
    function getUserDeposits(
        address user
    ) external view returns (CollateralDeposit[] memory) {
        uint256[] memory depositIds = userDepositIds[user];
        CollateralDeposit[] memory userDeposits = new CollateralDeposit[](
            depositIds.length
        );

        for (uint256 i = 0; i < depositIds.length; i++) {
            userDeposits[i] = deposits[depositIds[i]];
        }

        return userDeposits;
    }

    /**
     * @notice Check if collateral is sufficient for a loan
     * @param loanId The ID of the loan
     * @param loanAmount The loan amount in USD (18 decimals)
     * @param requiredRatio The required collateral ratio (basis points)
     * @return isSufficient True if collateral is sufficient
     */
    function isCollateralSufficient(
        uint256 loanId,
        uint256 loanAmount,
        uint256 requiredRatio
    ) external view returns (bool) {
        if (loanAmount == 0) return true;

        uint256 collateralValue = this.getLoanCollateralValue(loanId);
        uint256 actualRatio = (collateralValue * BASIS_POINTS) / loanAmount;

        return actualRatio >= requiredRatio;
    }

    /**
     * @notice Calculate health factor for a loan
     * @param loanId The ID of the loan
     * @param loanAmount The loan amount in USD (18 decimals)
     * @return healthFactor The health factor (10000 = 100%)
     */
    function calculateHealthFactor(
        uint256 loanId,
        uint256 loanAmount
    ) external view returns (uint256 healthFactor) {
        if (loanAmount == 0) return type(uint256).max;

        uint256 collateralValue = this.getLoanCollateralValue(loanId);
        healthFactor = (collateralValue * BASIS_POINTS) / loanAmount;

        return healthFactor;
    }

    /**
     * @notice Check if a loan is eligible for liquidation
     * @param loanId The ID of the loan
     * @param loanAmount The loan amount in USD (18 decimals)
     * @return canLiquidate True if loan can be liquidated
     */
    function canLiquidate(
        uint256 loanId,
        uint256 loanAmount
    ) external view returns (bool) {
        if (loanAmount == 0) return false;

        uint256 healthFactor = this.calculateHealthFactor(loanId, loanAmount);

        // Can liquidate if health factor below threshold (110%)
        return healthFactor < LIQUIDATION_THRESHOLD;
    }

    /**
     * @notice Get all supported collateral tokens
     * @return tokens Array of supported token addresses
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokenList;
    }

    /**
     * @notice Get token information
     * @param token The token address
     * @return tokenInfo The token info struct
     */
    function getTokenInfo(
        address token
    ) external view returns (TokenInfo memory) {
        return supportedTokens[token];
    }

    function getTokenUSDValue(
        address token,
        uint256 amount
    ) external view returns (uint256) {
        uint8 decimals = tokenDecimals[token];
        return priceOracle.getTokenValueInUSD(token, amount, decimals);
    }

    /**
     * @notice Get detailed collateral value information
     * @param token The token address
     * @param amount The token amount
     * @return collateralValue Struct with value details
     */
    function getCollateralValueDetails(
        address token,
        uint256 amount
    ) external view returns (CollateralValue memory) {
        uint256 valueInUSD = priceOracle.getTokenValueInUSD(
            token,
            amount,
            tokenDecimals[token]
        );

        return
            CollateralValue({
                tokenAddress: token,
                amount: amount,
                valueInUSD: valueInUSD,
                lastUpdated: block.timestamp
            });
    }
}
