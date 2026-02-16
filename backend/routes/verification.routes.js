const express = require("express");
const router = express.Router();
const verificationService = require("../services/verification.service");
const { validateAddress } = require("../utils/validators");

/**
 * GET /api/verification/status/:address
 * Returns current on-chain verification status + any pending OTPs for the wallet
 */
router.get("/status/:address", validateAddress, async (req, res, next) => {
  try {
    const { address } = req.params;
    const status = await verificationService.getVerificationStatus(address);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/verification/send-otp
 * Body: { address, type: "email"|"phone", contact: "user@example.com" | "+6512345678" }
 * Generates and "sends" an OTP (logs in dev, real provider in prod)
 */
router.post("/send-otp", async (req, res, next) => {
  try {
    const { address, type, contact } = req.body;

    if (!address || !type || !contact) {
      return res.status(400).json({
        error: "address, type, and contact are required",
      });
    }

    let result;
    if (type === "email") {
      result = await verificationService.sendEmailOTP(address, contact);
    } else if (type === "phone") {
      result = await verificationService.sendPhoneOTP(address, contact);
    } else {
      return res.status(400).json({ error: 'type must be "email" or "phone"' });
    }

    res.json(result);
  } catch (error) {
    // Forward with statusCode if present
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/verification/verify-otp
 * Body: { address, type: "email"|"phone", otp: "123456" }
 * Validates OTP and calls the smart contract to record verification
 */
router.post("/verify-otp", async (req, res, next) => {
  try {
    const { address, type, otp } = req.body;

    if (!address || !type || !otp) {
      return res.status(400).json({
        error: "address, type, and otp are required",
      });
    }

    const result = await verificationService.verifyOTP(address, type, otp);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
