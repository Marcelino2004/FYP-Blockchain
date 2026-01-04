const express = require("express");
const router = express.Router();
const coSigningService = require("../services/cosigning.service");
const { validateAddress } = require("../utils/validators");

router.get("/requests", async (req, res, next) => {
  try {
    const requests = await coSigningService.getAllOpenRequests();
    res.json({ requests });
  } catch (error) {
    next(error);
  }
});

router.get("/user/:address", validateAddress, async (req, res, next) => {
  try {
    const { address } = req.params;
    const data = await coSigningService.getUserCoSignings(address);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
