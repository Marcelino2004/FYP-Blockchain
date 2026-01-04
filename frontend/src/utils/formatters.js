// Formatting utilities for display

import { format, formatDistanceToNow, isPast } from "date-fns";

// ============ Address Formatting ============

/**
 * Format Ethereum address for display
 * @param {string} address - Full Ethereum address
 * @param {number} chars - Number of characters to show on each end
 * @returns {string} Formatted address (e.g., "0x1234...5678")
 */
export const formatAddress = (address, chars = 4) => {
  if (!address) return "";
  if (address.length < chars * 2) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
};

/**
 * Copy address to clipboard
 * @param {string} address - Address to copy
 * @returns {Promise<boolean>} Success status
 */
export const copyAddress = async (address) => {
  try {
    await navigator.clipboard.writeText(address);
    return true;
  } catch (error) {
    console.error("Failed to copy:", error);
    return false;
  }
};

// ============ Number Formatting ============

/**
 * Format number with commas
 * @param {number|string} number - Number to format
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted number
 */
export const formatNumber = (number, decimals = 2) => {
  if (!number && number !== 0) return "0";
  const num = typeof number === "string" ? parseFloat(number) : number;
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Format currency (USD)
 * @param {number|string} amount - Amount to format
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted currency
 */
export const formatCurrency = (amount, decimals = 2) => {
  if (!amount && amount !== 0) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

/**
 * Format token amount
 * @param {number|string} amount - Token amount
 * @param {number} decimals - Decimal places
 * @param {string} symbol - Token symbol
 * @returns {string} Formatted token amount
 */
export const formatTokenAmount = (amount, decimals = 4, symbol = "") => {
  if (!amount && amount !== 0) return `0 ${symbol}`.trim();
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = formatNumber(num, decimals);
  return symbol ? `${formatted} ${symbol}` : formatted;
};

/**
 * Format percentage
 * @param {number|string} value - Percentage value
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted percentage
 */
export const formatPercentage = (value, decimals = 2) => {
  if (!value && value !== 0) return "0%";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `${formatNumber(num, decimals)}%`;
};

/**
 * Format large numbers with K, M, B suffixes
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export const formatCompactNumber = (num) => {
  if (!num && num !== 0) return "0";

  const absNum = Math.abs(num);

  if (absNum >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (absNum >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (absNum >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }

  return num.toString();
};

// ============ Date/Time Formatting ============

/**
 * Format timestamp to readable date
 * @param {number|string|Date} timestamp - Unix timestamp, ISO string, or Date
 * @param {string} formatStr - Date format string
 * @returns {string} Formatted date
 */
export const formatDate = (timestamp, formatStr = "MMM dd, yyyy") => {
  if (!timestamp) return "N/A";

  let date;
  if (typeof timestamp === "number") {
    // Unix timestamp (assume seconds if < 10 digits)
    date =
      timestamp < 10000000000
        ? new Date(timestamp * 1000)
        : new Date(timestamp);
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }

  if (isNaN(date.getTime())) return "Invalid Date";

  return format(date, formatStr);
};

/**
 * Format timestamp to readable datetime
 * @param {number|string|Date} timestamp - Timestamp
 * @returns {string} Formatted datetime
 */
export const formatDateTime = (timestamp) => {
  return formatDate(timestamp, "MMM dd, yyyy HH:mm");
};

/**
 * Format timestamp as relative time (e.g., "2 hours ago")
 * @param {number|string|Date} timestamp - Timestamp
 * @returns {string} Relative time
 */
export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "N/A";

  let date;
  if (typeof timestamp === "number") {
    date =
      timestamp < 10000000000
        ? new Date(timestamp * 1000)
        : new Date(timestamp);
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }

  if (isNaN(date.getTime())) return "Invalid Date";

  return formatDistanceToNow(date, { addSuffix: true });
};

/**
 * Format duration in days
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export const formatDuration = (seconds) => {
  if (!seconds) return "0 days";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);

  if (days > 0) {
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
};

/**
 * Check if date is in the past
 * @param {number|string|Date} timestamp - Timestamp
 * @returns {boolean} True if past
 */
export const isDatePast = (timestamp) => {
  if (!timestamp) return false;

  let date;
  if (typeof timestamp === "number") {
    date =
      timestamp < 10000000000
        ? new Date(timestamp * 1000)
        : new Date(timestamp);
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }

  return isPast(date);
};

// ============ Blockchain Data Formatting ============

/**
 * Format wei to ether
 * @param {string|bigint} wei - Wei amount
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted ether amount
 */
export const formatWeiToEther = (wei, decimals = 4) => {
  if (!wei) return "0";

  try {
    // Simple division for display (ethers.js formatEther should be used for precision)
    const ether = Number(wei) / 1e18;
    return formatNumber(ether, decimals);
  } catch (error) {
    console.error("Error formatting wei to ether:", error);
    return "0";
  }
};

/**
 * Format transaction hash for display
 * @param {string} hash - Transaction hash
 * @returns {string} Formatted hash
 */
export const formatTxHash = (hash) => {
  return formatAddress(hash, 6);
};

/**
 * Get Etherscan link for address
 * @param {string} address - Address
 * @param {string} network - Network name
 * @returns {string} Etherscan URL
 */
export const getEtherscanAddressLink = (address, network = "sepolia") => {
  const baseUrl =
    network === "mainnet"
      ? "https://etherscan.io"
      : `https://${network}.etherscan.io`;
  return `${baseUrl}/address/${address}`;
};

/**
 * Get Etherscan link for transaction
 * @param {string} hash - Transaction hash
 * @param {string} network - Network name
 * @returns {string} Etherscan URL
 */
export const getEtherscanTxLink = (hash, network = "sepolia") => {
  const baseUrl =
    network === "mainnet"
      ? "https://etherscan.io"
      : `https://${network}.etherscan.io`;
  return `${baseUrl}/tx/${hash}`;
};

// ============ Validation Helpers ============

/**
 * Check if string is valid Ethereum address
 * @param {string} address - Address to check
 * @returns {boolean} True if valid
 */
export const isValidAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Check if string is valid transaction hash
 * @param {string} hash - Hash to check
 * @returns {boolean} True if valid
 */
export const isValidTxHash = (hash) => {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
};

// ============ Status Formatting ============

/**
 * Get color for loan status
 * @param {number} status - Loan status code
 * @returns {string} Tailwind color class
 */
export const getLoanStatusColor = (status) => {
  const colors = {
    0: "text-yellow-600 bg-yellow-50", // PENDING
    1: "text-blue-600 bg-blue-50", // ACTIVE
    2: "text-green-600 bg-green-50", // REPAID
    3: "text-red-600 bg-red-50", // DEFAULTED
    4: "text-gray-600 bg-gray-50", // CANCELLED
  };
  return colors[status] || colors[4];
};

/**
 * Get color for reputation level
 * @param {number} score - Reputation score
 * @returns {string} Tailwind color class
 */
export const getReputationColor = (score) => {
  const numScore = Number(score);
  if (numScore < 200) return "text-red-600 bg-red-50";
  if (numScore < 400) return "text-orange-600 bg-orange-50";
  if (numScore < 600) return "text-yellow-600 bg-yellow-50";
  if (numScore < 800) return "text-blue-600 bg-blue-50";
  return "text-green-600 bg-green-50";
};

/**
 * Get color for health factor
 * @param {number} healthFactor - Health factor (percentage)
 * @returns {string} Tailwind color class
 */
export const getHealthFactorColor = (healthFactor) => {
  if (healthFactor < 110) return "text-red-600";
  if (healthFactor < 130) return "text-yellow-600";
  return "text-green-600";
};

// ============ Input Sanitization ============

/**
 * Parse input to number
 * @param {string} value - Input value
 * @returns {number} Parsed number or 0
 */
export const parseInputNumber = (value) => {
  if (!value) return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Format input for number field
 * @param {string} value - Input value
 * @param {number} maxDecimals - Maximum decimal places
 * @returns {string} Formatted value
 */
export const formatInputNumber = (value, maxDecimals = 18) => {
  if (!value) return "";

  // Remove non-numeric characters except dot
  let cleaned = value.replace(/[^\d.]/g, "");

  // Ensure only one decimal point
  const parts = cleaned.split(".");
  if (parts.length > 2) {
    cleaned = `${parts[0]}.${parts.slice(1).join("")}`;
  }

  // Limit decimal places
  if (parts.length === 2 && parts[1].length > maxDecimals) {
    cleaned = `${parts[0]}.${parts[1].substring(0, maxDecimals)}`;
  }

  return cleaned;
};

// ============ Export All ============
export default {
  formatAddress,
  copyAddress,
  formatNumber,
  formatCurrency,
  formatTokenAmount,
  formatPercentage,
  formatCompactNumber,
  formatDate,
  formatDateTime,
  formatTimeAgo,
  formatDuration,
  isDatePast,
  formatWeiToEther,
  formatTxHash,
  getEtherscanAddressLink,
  getEtherscanTxLink,
  isValidAddress,
  isValidTxHash,
  getLoanStatusColor,
  getReputationColor,
  getHealthFactorColor,
  parseInputNumber,
  formatInputNumber,
};
