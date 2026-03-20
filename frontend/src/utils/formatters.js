// Formatting utilities for display

import { format, formatDistanceToNow, isPast } from "date-fns";

// ============ Address Formatting ============

export const formatAddress = (address, chars = 4) => {
  if (!address) return "";
  if (address.length < chars * 2) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
};

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

export const formatNumber = (number, decimals = 2) => {
  if (!number && number !== 0) return "0";
  const num = typeof number === "string" ? parseFloat(number) : number;
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

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

export const formatTokenAmount = (amount, decimals = 4, symbol = "") => {
  if (!amount && amount !== 0) return `0 ${symbol}`.trim();
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = formatNumber(num, decimals);
  return symbol ? `${formatted} ${symbol}` : formatted;
};

export const formatPercentage = (value, decimals = 2) => {
  if (!value && value !== 0) return "0%";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `${formatNumber(num, decimals)}%`;
};

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

export const formatDate = (timestamp, formatStr = "MMM dd, yyyy") => {
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

  return format(date, formatStr);
};

export const formatDateTime = (timestamp) => {
  return formatDate(timestamp, "MMM dd, yyyy HH:mm");
};

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

export const formatTxHash = (hash) => {
  return formatAddress(hash, 6);
};

export const getEtherscanAddressLink = (address, network = "sepolia") => {
  const baseUrl =
    network === "mainnet"
      ? "https://etherscan.io"
      : `https://${network}.etherscan.io`;
  return `${baseUrl}/address/${address}`;
};

export const getEtherscanTxLink = (hash, network = "sepolia") => {
  const baseUrl =
    network === "mainnet"
      ? "https://etherscan.io"
      : `https://${network}.etherscan.io`;
  return `${baseUrl}/tx/${hash}`;
};

// ============ Validation Helpers ============

export const isValidAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const isValidTxHash = (hash) => {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
};

// ============ Status Formatting ============

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

export const getReputationColor = (score) => {
  const numScore = Number(score);
  if (numScore < 200) return "text-red-600 bg-red-50";
  if (numScore < 400) return "text-orange-600 bg-orange-50";
  if (numScore < 600) return "text-yellow-600 bg-yellow-50";
  if (numScore < 800) return "text-blue-600 bg-blue-50";
  return "text-green-600 bg-green-50";
};

export const getHealthFactorColor = (healthFactor) => {
  if (healthFactor < 110) return "text-red-600";
  if (healthFactor < 130) return "text-yellow-600";
  return "text-green-600";
};

// ============ Input Sanitization ============

export const parseInputNumber = (value) => {
  if (!value) return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

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
