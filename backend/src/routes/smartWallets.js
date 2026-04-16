const express = require("express");
const { getSmartWalletsForToken } = require("../services/smartWalletsService");

const router = express.Router();

router.get("/:address", async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ ok: false, error: "address_required" });
    }

    const result = await getSmartWalletsForToken(address);
    return res.json({
      ok: true,
      data: result.wallets,
      meta: {
        tokenAddress: address,
        ...(result.meta || {}),
        count: result.wallets?.length ?? 0
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "smart_wallets_failed" });
  }
});

module.exports = router;

