const express = require("express");
const { authMiddleware } = require("./auth");
const { getSupabase } = require("../lib/supabase");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");

const router = express.Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("wallet_stalks")
      .select("stalked_wallet, created_at, is_active")
      .eq("user_id", req.user.userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ ok: true, data: data || [] });
  } catch (error) {
    console.error("wallet-stalker/list:", error.message);
    return res.status(500).json({ ok: false, error: "wallet_stalker_list_failed" });
  }
});

router.post("/", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").trim();
    if (!isProbableSolanaPubkey(wallet)) {
      return res.status(400).json({ ok: false, error: "invalid_wallet" });
    }
    const supabase = getSupabase();
    const { data: activeRows, error: activeErr } = await supabase
      .from("wallet_stalks")
      .select("stalked_wallet")
      .eq("user_id", req.user.userId)
      .eq("is_active", true);
    if (activeErr) throw activeErr;
    const activeCount = Array.isArray(activeRows) ? activeRows.length : 0;
    if (!req.user?.hasProAccess && activeCount >= 3) {
      return res.status(403).json({
        ok: false,
        error: "free_limit_reached",
        message: "Free tier supports up to 3 stalked wallets."
      });
    }
    const { error } = await supabase.from("wallet_stalks").upsert(
      {
        user_id: req.user.userId,
        stalked_wallet: wallet,
        is_active: true
      },
      { onConflict: "user_id,stalked_wallet" }
    );
    if (error) throw error;
    return res.json({ ok: true });
  } catch (error) {
    console.error("wallet-stalker/add:", error.message);
    return res.status(500).json({ ok: false, error: "wallet_stalker_add_failed" });
  }
});

router.delete("/:wallet", async (req, res) => {
  try {
    const wallet = String(req.params.wallet || "").trim();
    if (!isProbableSolanaPubkey(wallet)) {
      return res.status(400).json({ ok: false, error: "invalid_wallet" });
    }
    const supabase = getSupabase();
    const { error } = await supabase
      .from("wallet_stalks")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.userId)
      .eq("stalked_wallet", wallet);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (error) {
    console.error("wallet-stalker/remove:", error.message);
    return res.status(500).json({ ok: false, error: "wallet_stalker_remove_failed" });
  }
});

module.exports = router;

