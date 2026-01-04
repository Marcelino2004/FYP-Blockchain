const express = require("express");
const router = express.Router();
const loansService = require("../services/loans.service");

router.get("/platform", async (req, res, next) => {
  try {
    const stats = await loansService.getPlatformStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
