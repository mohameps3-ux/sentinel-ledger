const express = require("express");
const { getSupabase } = require("../lib/supabase");
const { authMiddleware } = require("./auth");

const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { tokenAddress, note = null, priority = 0 } = req.body || {};
    if (!tokenAddress)
      return res.status(400).json({ ok: false, error: "tokenAddress_required" });
    if (Number(priority || 0) > 0 && !req.user?.hasProAccess) {
      return res.status(403).json({
        ok: false,
        error: "Upgrade to PRO to use priority alerts."
      });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("watchlists")
      .upsert(
        {
          user_id: req.user.userId,
          token_address: tokenAddress,
          note,
          priority
        },
        { onConflict: "user_id,token_address" }
      )
      .select("*")
      .single();

    if (error) throw error;
    return res.json({ ok: true, data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "watchlist_add_failed" });
  }
});

router.delete("/:tokenAddress", authMiddleware, async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const supabase = getSupabase();
    const { error } = await supabase
      .from("watchlists")
      .delete()
      .eq("user_id", req.user.userId)
      .eq("token_address", tokenAddress);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "watchlist_remove_failed" });
  }
});

router.patch("/:tokenAddress/note", authMiddleware, async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const { note } = req.body || {};
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("watchlists")
      .update({ note })
      .eq("user_id", req.user.userId)
      .eq("token_address", tokenAddress)
      .select("*")
      .single();
    if (error) throw error;
    return res.json({ ok: true, data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "watchlist_note_failed" });
  }
});

module.exports = router;
