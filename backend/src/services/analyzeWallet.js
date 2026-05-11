const { fetchWalletTransactions, deltaFetchingEnabled } = require("./heliusTransactions");
const { ecoModeActive } = require("./budgetGuard");
const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("./marketData");
const { shouldSkipWalletAnalysis } = require("../lib/walletDenylist");
const {
  computeEarlyEntryScore,
  computeConsistencyScore,
  detectCluster
} = require("./smartWalletScoring");
const { isRealTrade } = require("./transactionClassifier");

function pickTokenTransfers(tx) {
  const meta = tx?.meta;
  const transferCandidates = [];
  const parsedInstructions = tx?.transaction?.message?.instructions || [];
  for (const ix of parsedInstructions) {
    const info = ix?.parsed?.info;
    const mint = info?.mint;
    const destination = info?.destination || info?.account;
    const amountRaw = info?.tokenAmount?.uiAmount || info?.amount || 0;
    if (mint) {
      transferCandidates.push({
        mint,
        destination,
        amount: Number(amountRaw) || 0
      });
    }
  }

  const post = meta?.postTokenBalances || [];
  const pre = meta?.preTokenBalances || [];
  for (const pb of post) {
    const mint = pb?.mint;
    if (!mint) continue;
    const postAmount = Number(pb?.uiTokenAmount?.uiAmount || 0);
    const matchingPre = pre.find((x) => x?.accountIndex === pb?.accountIndex);
    const preAmount = Number(matchingPre?.uiTokenAmount?.uiAmount || 0);
    const delta = postAmount - preAmount;
    transferCandidates.push({
      mint,
      destination: pb?.owner || null,
      amount: delta
    });
  }
  return transferCandidates;
}

function inferBuyEvents(walletAddress, tx) {
  if (!isRealTrade(tx)) return [];
  const tokenTransfers = pickTokenTransfers(tx);
  const slotTime = tx?.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString();
  return tokenTransfers
    .filter((t) => t?.mint && Number(t.amount || 0) > 0 && (!t.destination || t.destination === walletAddress))
    .map((t) => ({
      tokenAddress: t.mint,
      amount: Number(t.amount || 0),
      boughtAtIso: slotTime,
      signature: tx?.transaction?.signatures?.[0] || null
    }));
}

/** Token balance decreases for this owner → treat as sell / exit leg (best-effort). */
function inferSellEvents(walletAddress, tx) {
  if (!isRealTrade(tx)) return [];
  const meta = tx?.meta;
  const post = meta?.postTokenBalances || [];
  const pre = meta?.preTokenBalances || [];
  const slotTime = tx?.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString();
  const sig = tx?.transaction?.signatures?.[0] || null;
  const out = [];
  for (const pb of post) {
    if (pb?.owner !== walletAddress) continue;
    const mint = pb?.mint;
    if (!mint) continue;
    const postAmount = Number(pb?.uiTokenAmount?.uiAmount || 0);
    const matchingPre = pre.find((x) => x?.accountIndex === pb?.accountIndex);
    const preAmount = Number(matchingPre?.uiTokenAmount?.uiAmount || 0);
    const delta = postAmount - preAmount;
    if (delta < 0) {
      out.push({
        tokenAddress: mint,
        amountAbs: Math.abs(delta),
        soldAtIso: slotTime,
        signature: sig
      });
    }
  }
  return out;
}

async function upsertSmartWalletRow(supabase, payload) {
  // First attempt with advanced schema.
  const rich = await supabase
    .from("smart_wallets")
    .upsert(payload, { onConflict: "wallet_address" });
  if (!rich.error) return;

  // Fallback to legacy schema if advanced columns are not present yet.
  const minimalPayload = {
    wallet_address: payload.wallet_address,
    win_rate: payload.win_rate,
    pnl_30d: payload.pnl_30d,
    avg_position_size: payload.avg_position_size,
    recent_hits: payload.recent_hits,
    last_seen: payload.last_seen,
    updated_at: payload.updated_at
  };
  if (payload.last_signature) {
    minimalPayload.last_signature = payload.last_signature;
  }
  const minimal = await supabase
    .from("smart_wallets")
    .upsert(minimalPayload, { onConflict: "wallet_address" });
  if (minimal.error) throw minimal.error;
}

async function analyzeWallet(walletAddress) {
  if (shouldSkipWalletAnalysis(walletAddress)) {
    return { walletAddress, totalTrades: 0, skipped: true, reason: "wallet_denylist" };
  }
  if (await ecoModeActive()) {
    console.log(`[analyzeWallet] skipped due to ECO_MODE (${walletAddress})`);
    return { walletAddress, totalTrades: 0, skipped: true, reason: "eco_mode" };
  }

  const supabase = getSupabase();

  let lastSignatureRow = null;
  try {
    const { data, error } = await supabase
      .from("smart_wallets")
      .select("last_signature")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (!error) lastSignatureRow = data;
  } catch (_) {}

  const untilSignature = lastSignatureRow?.last_signature
    ? String(lastSignatureRow.last_signature).trim() || null
    : null;

  /**
   * Fase 4 — Delta fetch (Helius/RPC): when `FF_DELTA_FETCHING` is on (default), we pass
   * `untilSignature` into `getSignaturesForAddress` as JSON-RPC `until` (see heliusTransactions.js).
   * First run (no `last_signature`): larger bootstrap page; subsequent runs only pull newer sigs.
   */
  const fetchOpts = deltaFetchingEnabled()
    ? { untilSignature, skipGlobalDedupe: true }
    : { limit: 100, skipGlobalDedupe: false };

  const { transactions: txs, deltaStats } = await fetchWalletTransactions(walletAddress, fetchOpts);

  if (!txs.length) {
    return { walletAddress, totalTrades: 0, deltaStats };
  }
  let totalTrades = 0;
  let sellTrades = 0;
  let profitableTrades = 0;
  let totalUsd = 0;
  let earlyScores = [];
  let clusterScores = [];

  for (const tx of txs) {
    const sellEvents = inferSellEvents(walletAddress, tx).slice(0, 2);
    for (const se of sellEvents) {
      sellTrades += 1;
      totalTrades += 1;
      try {
        await supabase.from("token_activity_logs").insert({
          token_address: se.tokenAddress,
          wallet_address: walletAddress,
          timestamp: se.soldAtIso
        });
      } catch (_) {}
    }

    const buyEvents = inferBuyEvents(walletAddress, tx).slice(0, 2);
    for (const ev of buyEvents) {
      try {
        const market = await getMarketData(ev.tokenAddress);
        const currentPrice = Number(market?.price || 0);
        const maxPrice24h = currentPrice * 1.5;
        const minPrice24h = Math.max(0, currentPrice * 0.8);
        const earlyScore = computeEarlyEntryScore(currentPrice, maxPrice24h, minPrice24h);
        const clusterScore = await detectCluster(ev.tokenAddress, ev.boughtAtIso);

        earlyScores.push(earlyScore);
        clusterScores.push(clusterScore);
        totalTrades += 1;
        if (earlyScore > 70) profitableTrades += 1;

        const amountUsd = Number(ev.amount || 0) * currentPrice;
        totalUsd += Number.isFinite(amountUsd) ? amountUsd : 0;

        await supabase.from("token_activity_logs").insert({
          token_address: ev.tokenAddress,
          wallet_address: walletAddress,
          timestamp: ev.boughtAtIso
        });
        await supabase.from("wallet_tokens").upsert(
          {
            wallet_address: walletAddress,
            token_address: ev.tokenAddress,
            tx_signature: ev.signature,
            amount_usd: Number.isFinite(amountUsd) ? amountUsd : null,
            bought_at: ev.boughtAtIso
          },
          { onConflict: "wallet_address,token_address,tx_signature" }
        );
      } catch (err) {
        console.warn("analyze wallet tx skipped:", err.message);
      }
    }
  }

  const buyTrades = Math.max(0, totalTrades - sellTrades);
  const winRateRatio = buyTrades > 0 ? profitableTrades / buyTrades : 0;
  const avgEarlyEntry = earlyScores.length
    ? earlyScores.reduce((a, b) => a + b, 0) / earlyScores.length
    : 0;
  const avgCluster = clusterScores.length
    ? clusterScores.reduce((a, b) => a + b, 0) / clusterScores.length
    : 0;
  const consistency = computeConsistencyScore(winRateRatio, totalTrades);

  const since30dIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signalRows, error: signalsError } = await supabase
    .from("smart_wallet_signals")
    .select("result_pct")
    .eq("wallet_address", walletAddress)
    .not("result_pct", "is", null)
    .gte("created_at", since30dIso)
    .order("created_at", { ascending: true })
    .limit(10000);

  let totalTradesFromSignals = 0;
  let wins = 0;
  let sumPct = 0;

  if (Array.isArray(signalRows)) {
    for (const row of signalRows) {
      const p = Number(row?.result_pct);
      if (!Number.isFinite(p)) continue;

      totalTradesFromSignals += 1;
      sumPct += p;
      if (p > 0) wins += 1;
    }
  }

  const winRateFromSignals =
    totalTradesFromSignals > 0 ? (wins / totalTradesFromSignals) * 100 : null;

  const pnl30dFromSignals =
    totalTradesFromSignals > 0 ? Math.round(sumPct * 100) / 100 : null;

  if (signalsError) {
    console.warn("analyzeWallet smart_wallet_signals:", signalsError.message);
  }

  const smartScore =
    totalTradesFromSignals > 0
      ? Math.max(
          0,
          Math.min(
            100,
            winRateFromSignals * 0.6 + Math.min(totalTradesFromSignals, 50) * 0.4
          )
        )
      : null;

  const nowIso = new Date().toISOString();
  const payload = {
    wallet_address: walletAddress,
    win_rate: winRateFromSignals,
    pnl_30d: pnl30dFromSignals,
    avg_position_size: totalTrades ? totalUsd / totalTrades : 0,
    recent_hits: profitableTrades,
    total_trades: totalTradesFromSignals,
    profitable_trades: profitableTrades,
    early_entry_score: avgEarlyEntry,
    cluster_score: avgCluster,
    consistency_score: consistency,
    smart_score: smartScore,
    last_seen: nowIso,
    updated_at: nowIso
  };

  if (deltaStats?.headSignature) {
    payload.last_signature = deltaStats.headSignature;
  }

  await upsertSmartWalletRow(supabase, payload);

  if (deltaStats && deltaFetchingEnabled()) {
    console.log(
      `[analyzeWallet] wallet ${walletAddress}: new signatures=${deltaStats.newSignatures}, cached=${deltaStats.cacheHits}, rpc=${deltaStats.rpcParsed}, saved last_signature=${payload.last_signature || "—"}`
    );
  }

  return { walletAddress, totalTrades, sellTrades, profitableTrades, deltaStats };
}

module.exports = { analyzeWallet };

