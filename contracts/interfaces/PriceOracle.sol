// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PriceOracle
 * @notice Wrapper contract for Chainlink price feeds
 * @dev Provides unified interface for getting token prices in USD
 */
contract PriceOracle is Ownable {
    // ============ State Variables ============

    // Mapping from token address to Chainlink price feed
    mapping(address => AggregatorV3Interface) public priceFeeds;

    // Mapping to track supported tokens
    mapping(address => bool) public isSupportedToken;

    // Array of all supported tokens
    address[] public supportedTokens;

    // Stale price threshold (default: 1 hour)
    uint256 public stalePriceThreshold = 1 hours;

    // Price deviation threshold for additional validation (in basis points)
    // e.g., 5000 = 50% deviation allowed
    uint256 public constant MAX_PRICE_DEVIATION = 5000; // 50%

    // Decimals for USD price (standardized to 18 decimals)
    uint8 public constant PRICE_DECIMALS = 18;

    // ============ Structs ============

    struct PriceData {
        uint256 price; // Price in USD (18 decimals)
        uint256 timestamp; // When price was updated
        uint80 roundId; // Chainlink round ID
        bool isValid; // Whether price is valid
    }

    // ============ Events ============

    event PriceFeedUpdated(
        address indexed token,
        address indexed priceFeed,
        string tokenSymbol
    );

    event PriceFeedRemoved(address indexed token);

    event PriceRetrieved(
        address indexed token,
        uint256 price,
        uint256 timestamp
    );

    event StalePriceThresholdUpdated(
        uint256 oldThreshold,
        uint256 newThreshold
    );

    event PriceValidationFailed(address indexed token, string reason);

    // ============ Errors ============

    error PriceOracle__InvalidPriceFeed();
    error PriceOracle__PriceFeedNotSet();
    error PriceOracle__StalePrice(uint256 timeSinceUpdate);
    error PriceOracle__InvalidPrice();
    error PriceOracle__InvalidRoundData();
    error PriceOracle__TokenAlreadySupported();
    error PriceOracle__TokenNotSupported();
    error PriceOracle__InvalidThreshold();
    error PriceOracle__ZeroAddress();

    // ============ Constructor ============

    constructor() Ownable() {}

    // ============ External Functions ============

    /**
     * @notice Set or update price feed for a token
     * @param token The token address
     * @param priceFeed The Chainlink price feed address
     * @param tokenSymbol The token symbol (for events)
     */
    function setPriceFeed(
        address token,
        address priceFeed,
        string calldata tokenSymbol
    ) external onlyOwner {
        if (token == address(0)) revert PriceOracle__ZeroAddress();
        if (priceFeed == address(0)) revert PriceOracle__InvalidPriceFeed();

        // Validate price feed by attempting to get latest round data
        AggregatorV3Interface feed = AggregatorV3Interface(priceFeed);
        try feed.latestRoundData() returns (
            uint80,
            int256 answer,
            uint256,
            uint256,
            uint80
        ) {
            if (answer <= 0) revert PriceOracle__InvalidPrice();
        } catch {
            revert PriceOracle__InvalidPriceFeed();
        }

        // Add to supported tokens if new
        if (!isSupportedToken[token]) {
            supportedTokens.push(token);
            isSupportedToken[token] = true;
        }

        priceFeeds[token] = feed;
        emit PriceFeedUpdated(token, priceFeed, tokenSymbol);
    }

    /**
     * @notice Remove a price feed for a token
     * @param token The token address
     */
    function removePriceFeed(address token) external onlyOwner {
        if (!isSupportedToken[token]) revert PriceOracle__TokenNotSupported();

        delete priceFeeds[token];
        isSupportedToken[token] = false;

        // Remove from supported tokens array
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (supportedTokens[i] == token) {
                supportedTokens[i] = supportedTokens[
                    supportedTokens.length - 1
                ];
                supportedTokens.pop();
                break;
            }
        }

        emit PriceFeedRemoved(token);
    }

    /**
     * @notice Get the latest price for a token in USD
     * @param token The token address
     * @return price The price in USD (18 decimals)
     */
    function getPrice(address token) external view returns (uint256) {
        PriceData memory priceData = _getPriceData(token);

        if (!priceData.isValid) {
            revert PriceOracle__InvalidPrice();
        }

        return priceData.price;
    }

    /**
     * @notice Get detailed price data for a token
     * @param token The token address
     * @return priceData Struct containing price, timestamp, and validity
     */
    function getPriceData(
        address token
    ) external view returns (PriceData memory) {
        return _getPriceData(token);
    }

    /**
     * @notice Get token value in USD
     * @param token The token address
     * @param amount The token amount (in token's native decimals)
     * @param tokenDecimals The token's decimal places
     * @return valueInUSD The value in USD (18 decimals)
     */
    function getTokenValueInUSD(
        address token,
        uint256 amount,
        uint8 tokenDecimals
    ) external view returns (uint256 valueInUSD) {
        uint256 price = this.getPrice(token);

        // Normalize token amount to 18 decimals, then multiply by price
        if (tokenDecimals <= 18) {
            uint256 normalizedAmount = amount * (10 ** (18 - tokenDecimals));
            valueInUSD = (normalizedAmount * price) / 1e18;
        } else {
            // If token has > 18 decimals (rare), scale down
            uint256 normalizedAmount = amount / (10 ** (tokenDecimals - 18));
            valueInUSD = (normalizedAmount * price) / 1e18;
        }

        return valueInUSD;
    }

    /**
     * @notice Get USD amount required for specific token amount
     * @param token The token address
     * @param usdAmount The USD amount desired (18 decimals)
     * @param tokenDecimals The token's decimal places
     * @return tokenAmount The token amount needed
     */
    function getTokenAmountForUSD(
        address token,
        uint256 usdAmount,
        uint8 tokenDecimals
    ) external view returns (uint256 tokenAmount) {
        uint256 price = this.getPrice(token);

        if (price == 0) revert PriceOracle__InvalidPrice();

        // Calculate token amount needed (in 18 decimals)
        uint256 tokenAmount18Decimals = (usdAmount * 1e18) / price;

        // Convert to token's native decimals
        if (tokenDecimals <= 18) {
            tokenAmount = tokenAmount18Decimals / (10 ** (18 - tokenDecimals));
        } else {
            tokenAmount = tokenAmount18Decimals * (10 ** (tokenDecimals - 18));
        }

        return tokenAmount;
    }

    /**
     * @notice Check if a price is stale
     * @param token The token address
     * @return isStale True if price is stale
     */
    function isPriceStale(address token) external view returns (bool) {
        if (!isSupportedToken[token]) return true;

        AggregatorV3Interface priceFeed = priceFeeds[token];

        try priceFeed.latestRoundData() returns (
            uint80,
            int256,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            return block.timestamp - updatedAt > stalePriceThreshold;
        } catch {
            return true;
        }
    }

    /**
     * @notice Get all supported tokens
     * @return Array of supported token addresses
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    /**
     * @notice Get the number of supported tokens
     * @return count The count of supported tokens
     */
    function getSupportedTokenCount() external view returns (uint256) {
        return supportedTokens.length;
    }

    /**
     * @notice Update stale price threshold
     * @param newThreshold New threshold in seconds
     */
    function setStalePriceThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold <= 0) {
            revert PriceOracle__InvalidThreshold();
        }

        uint256 oldThreshold = stalePriceThreshold;
        stalePriceThreshold = newThreshold;

        emit StalePriceThresholdUpdated(oldThreshold, newThreshold);
    }

    /**
     * @notice Get price feed decimals for a token
     * @param token The token address
     * @return decimals The decimals of the price feed
     */
    function getPriceFeedDecimals(address token) external view returns (uint8) {
        if (!isSupportedToken[token]) revert PriceOracle__TokenNotSupported();

        AggregatorV3Interface priceFeed = priceFeeds[token];
        return priceFeed.decimals();
    }

    /**
     * @notice Get price feed description for a token
     * @param token The token address
     * @return description The description of the price feed
     */
    function getPriceFeedDescription(
        address token
    ) external view returns (string memory) {
        if (!isSupportedToken[token]) revert PriceOracle__TokenNotSupported();

        AggregatorV3Interface priceFeed = priceFeeds[token];
        return priceFeed.description();
    }

    // ============ Internal Functions ============

    /**
     * @notice Internal function to get price data with validation
     * @param token The token address
     * @return priceData Struct containing price information
     */
    function _getPriceData(
        address token
    ) internal view returns (PriceData memory priceData) {
        if (!isSupportedToken[token]) revert PriceOracle__TokenNotSupported();

        AggregatorV3Interface priceFeed = priceFeeds[token];
        if (address(priceFeed) == address(0))
            revert PriceOracle__PriceFeedNotSet();

        try priceFeed.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            // Validate round data
            if (answeredInRound < roundId) {
                priceData.isValid = false;
                return priceData;
            }

            // Check for stale price
            uint256 timeSinceUpdate = block.timestamp - updatedAt;
            if (timeSinceUpdate > stalePriceThreshold) {
                revert PriceOracle__StalePrice(timeSinceUpdate);
            }

            // Check for invalid price
            if (answer <= 0) {
                revert PriceOracle__InvalidPrice();
            }

            // Get price feed decimals and normalize to 18 decimals
            uint8 decimals = priceFeed.decimals();
            uint256 price;

            if (decimals < PRICE_DECIMALS) {
                price = uint256(answer) * (10 ** (PRICE_DECIMALS - decimals));
            } else if (decimals > PRICE_DECIMALS) {
                price = uint256(answer) / (10 ** (decimals - PRICE_DECIMALS));
            } else {
                price = uint256(answer);
            }

            priceData = PriceData({
                price: price,
                timestamp: updatedAt,
                roundId: roundId,
                isValid: true
            });
        } catch {
            revert PriceOracle__InvalidRoundData();
        }
    }

    /**
     * @notice Check if price feed is responsive
     * @param token The token address
     * @return isResponsive True if price feed is working
     */
    function _isPriceFeedResponsive(
        address token
    ) internal view returns (bool) {
        if (!isSupportedToken[token]) return false;

        AggregatorV3Interface priceFeed = priceFeeds[token];

        try priceFeed.latestRoundData() returns (
            uint80,
            int256 answer,
            uint256,
            uint256,
            uint80
        ) {
            return answer > 0;
        } catch {
            return false;
        }
    }
}
