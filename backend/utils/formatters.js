const { ethers } = require("ethers");

function formatAddress(address) {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return null;
  const date = new Date(Number(timestamp) * 1000);
  return date.toISOString();
}

function formatTokenAmount(amount, decimals = 18, symbol = "") {
  if (!amount) return "0";
  const formatted = ethers.formatUnits(amount, decimals);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

function formatPercentage(basisPoints) {
  if (!basisPoints) return "0%";
  return `${(Number(basisPoints) / 100).toFixed(2)}%`;
}

function formatDuration(seconds) {
  if (!seconds) return "0 days";
  const days = Math.floor(Number(seconds) / 86400);
  const hours = Math.floor((Number(seconds) % 86400) / 3600);

  if (days > 0) {
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}

function formatUSD(amount) {
  if (!amount) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `$${num.toFixed(2)}`;
}

module.exports = {
  formatAddress,
  formatTimestamp,
  formatTokenAmount,
  formatPercentage,
  formatDuration,
  formatUSD,
};
