const express = require("express");
const { getSmartWalletsForToken } = require("../services/smartWalletsService");

const router = express.Router();

router.get("/:address", async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ ok: false, error: "address_required" });
    }

    const wallets = await getSmartWalletsForToken(address);
    return res.json({
      ok: true,
      data: wallets,
      meta: {
        tokenAddress: address,
        minWinRate: 70,
        count: wallets.length
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "smart_wallets_failed" });
  }
});

module.exports = router;

