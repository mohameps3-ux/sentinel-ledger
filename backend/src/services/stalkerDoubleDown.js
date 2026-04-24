/**
 * F4: "Double down" for wallet-stalk: current notional / first notional on (wallet, mint) ≥ 3.
 * BUY-only: `isBuyLike` is strictly `type === "buy"`. Helius legs normalized as `swap` do not
 * update baselines or emit DOUBLE_DOWN (you still get F0 pool/USD enrichment from heliusWebhook).
 * Treating net-buy inside swaps as F4 is product scope **F4.1** (normalizer / classification change),
 * not a gap in the current F4 implementation.
 * Dedupe (wallet, mint, signature) for Helius replays.
 */
"use strict";

const { isMissingColumnError } = require("../lib/columnMissingError");

const DOUBLE_DOWN_MIN_MULT = 3;

function isBuyLike(type) {
  return type === "buy";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {object|null} baseline
 * @param {number} amountUsd
 */
function convictionFromFirstNotional(baseline, amountUsd) {
  if (!baseline) return null;
  const first = Number(baseline.first_notional_usd);
  if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(amountUsd) || amountUsd <= 0) return null;
  const m = amountUsd / first;
  if (m < DOUBLE_DOWN_MIN_MULT) return null;
  return { conviction: "DOUBLE_DOWN", convictionMultiplier: round2(m) };
}

function isRecoverableSchemaError(e) {
  if (e?.code === "42P01") return true;
  const s = String(e?.message || e || "");
  if (/stalker_position_baselines|stalker_baseline_dedup|42P01/i.test(s)) return true;
  return isMissingColumnError(e, "first_notional_usd");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ wallet: string, token: string, amountUsd: number|null, type: string, signature: string }} p
 * @returns {Promise<Record<string, never>|{ conviction: 'DOUBLE_DOWN', convictionMultiplier: number }>}
 */
async function applyStalkerDoubleDown(supabase, p) {
  const wallet = String(p.wallet || "").trim();
  const token = String(p.token || "").trim();
  const sig = String(p.signature || "").trim();
  const t = String(p.type || "");
  if (!wallet || !token || !sig || !isBuyLike(t)) return {};

  const amountUsd = p.amountUsd != null ? Number(p.amountUsd) : null;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return {};

  try {
    const { data: dup, error: eD } = await supabase
      .from("stalker_baseline_dedup")
      .select("wallet_address")
      .eq("wallet_address", wallet)
      .eq("token_address", token)
      .eq("signature", sig)
      .maybeSingle();
    if (eD) throw eD;

    async function loadBaseline() {
      const { data: bl, error: eB } = await supabase
        .from("stalker_position_baselines")
        .select("first_notional_usd")
        .eq("wallet_address", wallet)
        .eq("token_address", token)
        .maybeSingle();
      if (eB) throw eB;
      return bl;
    }

    if (dup) {
      return convictionFromFirstNotional(await loadBaseline(), amountUsd) || {};
    }

    let bl = await loadBaseline();

    if (!bl) {
      const { error: eIns } = await supabase.from("stalker_position_baselines").insert({
        wallet_address: wallet,
        token_address: token,
        first_notional_usd: amountUsd
      });
      if (eIns && eIns.code !== "23505") throw eIns;
      bl = await loadBaseline();
      if (!bl) return {};
    }

    const out = convictionFromFirstNotional(bl, amountUsd);
    const { error: dIns } = await supabase.from("stalker_baseline_dedup").insert({
      wallet_address: wallet,
      token_address: token,
      signature: sig
    });
    if (dIns) {
      if (dIns.code === "23505") {
        return convictionFromFirstNotional(bl, amountUsd) || {};
      }
      throw dIns;
    }

    await supabase
      .from("stalker_position_baselines")
      .update({ updated_at: new Date().toISOString() })
      .eq("wallet_address", wallet)
      .eq("token_address", token);
    return out || {};
  } catch (e) {
    if (isRecoverableSchemaError(e)) return {};
    console.warn("[stalker] double-down:", (sig && sig.slice(0, 10)) || "?", e?.message || e);
    return {};
  }
}

module.exports = { applyStalkerDoubleDown, DOUBLE_DOWN_MIN_MULT, isBuyLike };
