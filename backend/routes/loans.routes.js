const express = require("express");
const router = express.Router();
const loansService = require("../services/loans.service");
const { validateAddress } = require("../utils/validators");

router.get("/offers/lenders", async (req, res, next) => {
  try {
    const offers = await loansService.getActiveLenderOffers();
    res.json({ offers });
  } catch (error) {
    next(error);
  }
});

router.get("/offers/borrowers", async (req, res, next) => {
  try {
    const requests = await loansService.getActiveBorrowerRequests();
    res.json({ requests });
  } catch (error) {
    next(error);
  }
});

router.get("/user/:address", validateAddress, async (req, res, next) => {
  try {
    const { address } = req.params;
    const loans = await loansService.getUserLoans(address);
    res.json({ loans });
  } catch (error) {
    next(error);
  }
});

router.get("/:loanId", async (req, res, next) => {
  try {
    const { loanId } = req.params;
    const loan = await loansService.getLoanDetails(loanId);
    res.json(loan);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
