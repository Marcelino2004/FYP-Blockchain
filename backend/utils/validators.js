const { ethers } = require("ethers");

function validateAddress(req, res, next) {
  const address = req.params.address || req.body.address;

  if (!address) {
    return res.status(400).json({ error: "Address is required" });
  }

  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid Ethereum address" });
  }

  next();
}

function validateLoanId(req, res, next) {
  const { loanId } = req.params;

  if (!loanId) {
    return res.status(400).json({ error: "Loan ID is required" });
  }

  if (isNaN(loanId) || parseInt(loanId) < 0) {
    return res.status(400).json({ error: "Invalid loan ID" });
  }

  next();
}

module.exports = {
  validateAddress,
  validateLoanId,
};
