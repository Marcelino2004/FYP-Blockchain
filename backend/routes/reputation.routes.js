const express = require("express");
const router = express.Router();
const reputationService = require("../services/reputation.service");
const { validateAddress } = require("../utils/validators");

router.get("/:address", validateAddress, async (req, res, next) => {
  try {
    const { address } = req.params;
    const reputation = await reputationService.getFullReputation(address);
    res.json(reputation);
  } catch (error) {
    next(error);
  }
});

// POST /api/reputation/:address/refresh
router.post("/:address/refresh", validateAddress, async (req, res, next) => {
  try {
    const { address } = req.params;
    await reputationService.pingReputation(address);
    const reputation = await reputationService.getFullReputation(address);
    res.json(reputation);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
