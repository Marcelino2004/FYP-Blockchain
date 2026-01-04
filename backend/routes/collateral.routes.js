const express = require("express");
const router = express.Router();
const collateralService = require("../services/collateral.service");
const { validateAddress } = require("../utils/validators");

router.get("/tokens", async (req, res, next) => {
  try {
    const tokens = await collateralService.getSupportedTokens();
    res.json({ tokens });
  } catch (error) {
    next(error);
  }
});

router.get("/user/:address", validateAddress, async (req, res, next) => {
  try {
    const { address } = req.params;
    const deposits = await collateralService.getUserCollateral(address);
    res.json({ deposits });
  } catch (error) {
    next(error);
  }
});

router.get("/loan/:loanId/value", async (req, res, next) => {
  try {
    const { loanId } = req.params;
    const collateralValue =
      await collateralService.getLoanCollateralValue(loanId);
    res.json(collateralValue);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
