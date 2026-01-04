const express = require("express");
const router = express.Router();
const priceService = require("../services/price.service");
const { validateAddress } = require("../utils/validators");

router.get("/", async (req, res, next) => {
  try {
    const prices = await priceService.getAllPrices();
    res.json({ prices });
  } catch (error) {
    next(error);
  }
});

router.get("/:tokenAddress", validateAddress, async (req, res, next) => {
  try {
    const { tokenAddress } = req.params;
    const price = await priceService.getTokenPrice(tokenAddress);
    res.json(price);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
