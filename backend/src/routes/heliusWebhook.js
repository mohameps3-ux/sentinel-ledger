const express = require("express");
const router = express.Router();

function normalizeHeliusEvent(raw) {
  const transfer = raw?.tokenTransfers?.[0];
  if (!transfer) return null;
  return {
    tokenAddress: transfer.mint,
    wallet: transfer.toUserAccount || transfer.fromUserAccount,
    amount: Number(transfer.tokenAmount),
    signature: raw.signature,
    timestamp: (raw.timestamp || 0) * 1000,
    type: transfer.toUserAccount ? "buy" : "sell"
  };
}

router.post("/helius", async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    for (const raw of events) {
      const tx = normalizeHeliusEvent(raw);
      if (tx && tx.tokenAddress && global.io) {
        global.io.to(tx.tokenAddress).emit("transaction", tx);
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

module.exports = router;

