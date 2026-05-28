"use strict";

/**
 * Procesado pesado del webhook Helius (Fase 3): scoring, sockets, DB.
 * Usado inline (FF_WEBHOOK_WORKER=false) o desde webhookScoringWorker.
 */

const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { trackSmartBuyAndDetect } = require("./convergenceService");
const { normalizeEvent } = require("../ingestion/sentinelEvent");
const { reserveEventId } = require("../ingestion/dedupe");
const {
  recordRawReceived,
  recordEventEmitted,
  recordSourceError
} = require("../ingestion/ingestionState");
const {
  shouldAllowMint
} = require("../ingestion/entropyGuard");
const { evaluate: evaluateScore } = require("../scoring/engine");
const { buildProbeConfidenceShadow } = require("../scoring/confidenceModel");
const { recordSignalEmission } = require("./signalPerformance");
const { getMarketData } = require("./marketData");
const { evaluateSignalEmission } = require("./signalEmissionGate");
const { buildAlphaLayer } = require("./signalAlphaLayer");
const { applyStalkerDoubleDown } = require("./stalkerDoubleDown");
const {
  buildStalkerEnrichmentFallback,
  buildStalkerEnrichmentFromMarket
} = require("../lib/stalkerImpact");
const { wireSmartWalletsAfterSignal } = require("./smartWalletWebhookWire");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const {
  walletTokensWrittenInc,
  walletTokensInsertNewInc,
  walletTokensConflictInc,
  walletTokensErrorInc
} = require("../lib/heliusWebhookTelemetry");

const SENTINEL_SOURCE = "helius_webhook";
const DEDUPE_TTL_SEC = 120;

const MARKET_MEMO_TTL_MS = 60_000;
const MARKET_MEMO_MAX = 500;
const marketMemo = new Map();

async function getMarketDataMemoized(asset) {
  if (!asset) return null;
  const now = Date.now();
  const hit = marketMemo.get(asset);
  if (hit && hit.expiresAt > now) return hit.value;
  let value = null;
  try {
    value = await getMarketData(asset);
  } catch (_) {
    value = null;
  }
  if (marketMemo.size >= MARKET_MEMO_MAX) {
    const firstKey = marketMemo.keys().next().value;
    if (firstKey !== undefined) marketMemo.delete(firstKey);
  }
  marketMemo.set(asset, { value, expiresAt: now + MARKET_MEMO_TTL_MS });
  return value;
}

function buildScoringContext(market, tokenAmount) {
  const priceUsd = market && Number(market.price) > 0 ? Number(market.price) : null;
  const liquidityUsd =
    market && Number(market.liquidity) > 0 ? Number(market.liquidity) : null;
  const amt = Number(tokenAmount);
  const amountUsd =
    priceUsd != null && Number.isFinite(amt) && amt > 0 ? amt * priceUsd : null;
  const priceChange24h =
    market && Number.isFinite(Number(market.priceChange24h))
      ? Number(market.priceChange24h)
      : null;
  const volume24h =
    market && Number.isFinite(Number(market.volume24h)) ? Number(market.volume24h) : null;
  const priceChange5m =
    market && Number.isFinite(Number(market.priceChange5m))
      ? Number(market.priceChange5m)
      : null;
  const created = market && Number(market.pairCreatedAt);
  const poolAgeMinutes =
    Number.isFinite(created) && created > 0 ? (Date.now() - created) / 60000 : null;
  const holderTop10Pct =
    market && Number.isFinite(Number(market.holderTop10Pct))
      ? Number(market.holderTop10Pct)
      : null;
  return {
    priceUsd,
    liquidityUsd,
    amountUsd,
    priceChange24h,
    volume24h,
    priceChange5m,
    poolAgeMinutes,
    holderTop10Pct
  };
}

async function markFirstEmit(dedupeKey) {
  try {
    const r = await redis.set(dedupeKey, "1", { nx: true, ex: DEDUPE_TTL_SEC });
    return r != null;
  } catch (_) {
    return true;
  }
}

function expandHeliusPayload(raw) {
  if (!raw || typeof raw !== "object") return [];
  const signature =
    raw.signature || raw.transaction?.signatures?.[0] || raw.transactionSignature || "";
  const tsMs = (Number(raw.timestamp) || 0) * 1000 || Date.now();
  const transfers = Array.isArray(raw.tokenTransfers) ? raw.tokenTransfers : [];
  const out = [];

  for (const t of transfers) {
    const mint = t.mint;
    if (!mint) continue;
    const amount = Math.abs(Number(t.tokenAmount ?? 0));
    const to = t.toUserAccount || null;
    const from = t.fromUserAccount || null;

    let type = "swap";
    if (to && !from) type = "buy";
    else if (from && !to) type = "sell";
    else if (to && from) type = "swap";

    const wallet = to || from || raw.feePayer || null;
    if (!wallet) continue;

    out.push({
      tokenAddress: mint,
      wallet,
      amount,
      signature,
      timestamp: tsMs,
      type
    });
  }

  return out;
}

function pgErrorCode(err) {
  const code = err?.code ?? err?.cause?.code;
  return code != null ? String(code) : null;
}

async function upsertWalletTokenRow(supabase, row) {
  const { data, error } = await supabase
    .from("wallet_tokens")
    .upsert(row, {
      onConflict: "wallet_address,token_address,tx_signature",
      ignoreDuplicates: true
    })
    .select("wallet_address");
  if (error) {
    const err = new Error(error.message || "wallet_tokens upsert failed");
    err.code = error.code;
    throw err;
  }
  walletTokensWrittenInc();
  if (Array.isArray(data) && data.length > 0) {
    walletTokensInsertNewInc();
    return "insert";
  }
  walletTokensConflictInc();
  return "conflict";
}

function walletTokensTxAgeLogEnabled() {
  return String(process.env.WALLET_TOKENS_TX_AGE_LOG || "false").trim().toLowerCase() === "true";
}

/**
 * @param {object} raw — payload Helius (un elemento del array webhook)
 * @returns {{ emitted: number, droppedByGuard: number, signalEmitted: boolean }}
 */
async function processHeliusWebhookRaw(raw) {
  let emitted = 0;
  let droppedByGuard = 0;
  let signalEmitted = false;

  recordRawReceived(SENTINEL_SOURCE);

  // Extract signer and seed smart_wallets pool: await smart_wallets first (FK for wallet_tokens), then wallet_tokens upserts (awaited for debug visibility).
  try {
    const signerAddress = String(
      raw.feePayer ||
        raw.transaction?.feePayer ||
        raw.transaction?.message?.accountKeys?.[0]?.pubkey ||
        raw.transaction?.message?.accountKeys?.[0] ||
        raw.accountData?.[0]?.account ||
        ""
    ).trim();
    const hasSwap = Array.isArray(raw.tokenTransfers) && raw.tokenTransfers.length > 0;
    if (signerAddress && hasSwap && isProbableSolanaPubkey(signerAddress)) {
      let supabase;
      try {
        supabase = getSupabase();
      } catch {
        supabase = null;
      }
      if (supabase) {
        try {
          await supabase.from("smart_wallets").upsert(
            { wallet_address: signerAddress, smart_score: 1 },
            { onConflict: "wallet_address", ignoreDuplicates: true }
          );
        } catch (_) {}

        const txSig = String(
          raw.signature || raw.transaction?.signatures?.[0] || raw.transactionSignature || ""
        ).trim();
        if (txSig) {
          const tsSec = Number(raw.timestamp);
          const tsMs =
            Number.isFinite(tsSec) && tsSec > 0 ? tsSec * 1000 : Date.now();
          const boughtAt = new Date(tsMs).toISOString();
          if (walletTokensTxAgeLogEnabled()) {
            console.log("[helius] tx age", {
              sig: txSig.slice(0, 16),
              payload_ts: new Date(tsMs).toISOString(),
              now: new Date().toISOString(),
              age_min: Math.round((Date.now() - tsMs) / 60000)
            });
          }
          for (const t of raw.tokenTransfers || []) {
            const mint = t?.mint && String(t.mint).trim();
            if (!mint || !isProbableSolanaPubkey(mint)) continue;
            try {
              await upsertWalletTokenRow(supabase, {
                wallet_address: signerAddress,
                token_address: mint,
                tx_signature: txSig,
                bought_at: boughtAt,
                amount_usd: null
              });
            } catch (err) {
              const code = pgErrorCode(err);
              walletTokensErrorInc({
                code,
                message: err?.message || String(err)
              });
              console.warn("[helius] wallet_tokens upsert failed", {
                code,
                mint,
                wallet: signerAddress,
                sig: txSig.slice(0, 16)
              });
            }
          }
        }
      }
    }
  } catch {
    /* non-fatal */
  }

  const txs = expandHeliusPayload(raw);

  for (let i = 0; i < txs.length; i += 1) {
    const tx = txs[i];
    // Persistencia (signal_performance, convergence, etc.) no debe depender de Socket.IO.
    if (!tx.tokenAddress) continue;
    const gate = shouldAllowMint(tx.tokenAddress);
    if (!gate.allowed) {
      droppedByGuard += 1;
      continue;
    }
    const sig = tx.signature || "nosig";

    const startedAt = Date.now();
    let sentinelEvent = null;
    try {
      sentinelEvent = normalizeEvent(
        {
          network: "solana",
          type:
            tx.type === "buy" || tx.type === "sell" || tx.type === "swap"
              ? "SWAP"
              : "TRANSFER",
          source: SENTINEL_SOURCE,
          signature: sig,
          blockNumber: Number(raw?.slot) || 0,
          blockHash: raw?.transaction?.message?.recentBlockhash || "",
          logIndex: i,
          timestamp: tx.timestamp,
          data: {
            actor: tx.wallet,
            asset: tx.tokenAddress,
            amount: String(tx.amount ?? "0")
          },
          metadata: { confidence: 0.85, labels: [tx.type].filter(Boolean) }
        },
        { processingStartedAt: startedAt }
      );
    } catch (e) {
      recordSourceError(SENTINEL_SOURCE, e);
    }

    if (sentinelEvent) {
      const r = await reserveEventId(sentinelEvent.id);
      if (r.duplicate) continue;
    } else {
      const legacyKey = `helius:tx:${sig}:${tx.tokenAddress}:${tx.wallet}:${tx.type}:${String(tx.amount)}`;
      const first = await markFirstEmit(legacyKey);
      if (!first) continue;
    }

    if (global.io) {
      global.io.to(tx.tokenAddress).emit("transaction", tx);
    }

    if (tx.type === "buy" || tx.type === "BUY") {
      try {
        const clusterProbing = require("./clusterProbing");
        const market = await getMarketDataMemoized(tx.tokenAddress);
        const price = market && Number(market.price) > 0 ? Number(market.price) : null;
        const probingResult = await clusterProbing.evaluateIntent(tx.tokenAddress, tx.wallet, price);
        if (probingResult?.action === "CLUSTER_ACTIVATION") {
          console.log("[probing] CLUSTER ACTIVATION detected:", {
            mint: probingResult.mint,
            confidence: probingResult.confidence,
            wallets: probingResult.wallets.length,
            priceSkew: probingResult.priceSkew
          });
          const ctx = buildScoringContext(market, tx.amount);
          ctx.wallets = Array.isArray(probingResult.wallets) ? probingResult.wallets : [];
          const absChg = Number.isFinite(Number(ctx.priceChange24h))
            ? Math.abs(Number(ctx.priceChange24h))
            : null;
          const probingScore = {
            asset: probingResult.mint,
            confidence: probingResult.confidence,
            signals: ["cluster_probing"],
            scores: { risk: 45, smart: 55, momentum: 50 },
            insights: [],
            timestamp: new Date().toISOString(),
            meta: {
              source: "cluster_probing",
              priority: "HIGH",
              clusterSig: probingResult.clusterSig,
              wallets: probingResult.wallets,
              priceSkew: probingResult.priceSkew,
              reason: probingResult.reason,
              confidenceShadow: buildProbeConfidenceShadow(probingResult.priceSkew, {
                minSkew: Number(process.env.CLUSTER_PROBE_MIN_PRICE_SKEW || 0),
                maxSkew: Number(process.env.CLUSTER_PROBE_MAX_PRICE_SKEW || 0.015),
                absChange24hPct: absChg,
                uniqueWallets: Array.isArray(probingResult.wallets) ? probingResult.wallets.length : 0
              })
            }
          };
          const gate = await evaluateSignalEmission(probingScore, ctx);
          if (gate.allow) {
            probingScore.meta = {
              ...(probingScore.meta || {}),
              emissionGate: {
                passed: true,
                unifiedScore: gate.unifiedScore,
                components: gate.components,
                regime: {
                  key: "cluster_activation",
                  classifierEnabled: false,
                  inputs: {},
                  patchKeys: []
                },
                effectiveGate: gate.effectiveGate,
                alphaLayer: null,
                meta: gate.confidenceMeta || null
              }
            };
            if (global.io) {
              global.io.to(probingResult.mint).emit("sentinel:score", probingScore);
            }
            const perfProbe = await recordSignalEmission(probingScore, {
              source: "cluster_probing",
              emission_regime: "cluster_activation",
              priority: "HIGH",
              walletAddresses: ctx.wallets
            });
            if (perfProbe && perfProbe.ok === false) {
              console.warn(
                `[helius-webhook] signal_performance skip (cluster) asset=${probingScore.asset} reason=${perfProbe.reason || "unknown"}`
              );
            } else {
              signalEmitted = true;
              console.log(`[probing] signal emitted for ${tx.tokenAddress}`);
              void wireSmartWalletsAfterSignal({ wallets: ctx.wallets, signature: sig }).catch((e) =>
                console.warn("[smart-wallet-wire] cluster:", e?.message || e)
              );
            }
          }
        }
      } catch (_) {
        /* non-fatal */
      }
    }

    if (sentinelEvent) {
      if (global.io) {
        global.io.to(tx.tokenAddress).emit("sentinel:event", sentinelEvent);
      }
      recordEventEmitted(sentinelEvent, Date.now() - startedAt);
      try {
        const market = await getMarketDataMemoized(tx.tokenAddress);
        const ctx = buildScoringContext(market, tx.amount);
        ctx.wallets = [String(tx.wallet || "").trim()].filter(Boolean);
        const score = await evaluateScore(sentinelEvent, ctx);
        if (score) {
          const alphaLayer = buildAlphaLayer(score, ctx);
          if (alphaLayer) {
            score.meta = { ...(score.meta || {}), alphaLayer };
          }
          const gate = await evaluateSignalEmission(score, {
            liquidityUsd: ctx?.liquidityUsd,
            priceChange24h: ctx?.priceChange24h,
            volume24h: ctx?.volume24h,
            priceChange5m: ctx?.priceChange5m,
            poolAgeMinutes: ctx?.poolAgeMinutes,
            holderTop10Pct: ctx?.holderTop10Pct,
            wallets: ctx.wallets
          });
          if (gate.allow) {
            score.meta = {
              ...(score.meta || {}),
              emissionGate: {
                passed: true,
                unifiedScore: gate.unifiedScore,
                components: gate.components,
                regime: gate.regime,
                effectiveGate: gate.effectiveGate,
                alphaLayer: score.meta?.alphaLayer || null,
                meta: gate.confidenceMeta || null
              }
            };
            if (global.io) {
              global.io.to(tx.tokenAddress).emit("sentinel:score", score);
            }
            const perf = await recordSignalEmission(score, { walletAddresses: ctx.wallets });
            if (perf && perf.ok === false) {
              console.warn(
                `[helius-webhook] signal_performance skip asset=${score.asset} reason=${perf.reason || "unknown"}`
              );
            } else if (perf?.ok) {
              signalEmitted = true;
              void wireSmartWalletsAfterSignal({ wallets: ctx.wallets, signature: sig }).catch((e) =>
                console.warn("[smart-wallet-wire] scoring path:", e?.message || e)
              );
            }
            if (score.confidence > 70 || (score.signals && score.signals.length > 2)) {
              console.log(
                `[SCORING_SIGNAL] ${score.asset} - ${score.confidence}% - ${(score.signals || []).join(",")}`
              );
            }
          }
        }
      } catch (err) {
        console.warn("[helius-webhook] scoring/signal_performance path failed:", err?.message || err);
      }
    }

    if (tx.type === "buy" || tx.type === "swap") {
      const conv = await trackSmartBuyAndDetect(tx.tokenAddress, tx.wallet, tx.timestamp, tx.type);
      if (conv?.detected && global.io) {
        global.io.to(tx.tokenAddress).emit("convergence", {
          tokenAddress: tx.tokenAddress,
          wallets: conv.wallets,
          detectedAt: new Date().toISOString(),
          windowMinutes: conv.windowMinutes
        });
      }
      if (conv?.redPrepare && global.io) {
        global.io.to(tx.tokenAddress).emit("coordination:red-signal", {
          redSignal: "RED_PREPARE",
          tokenAddress: tx.tokenAddress,
          detectedAt: conv.redPrepare.detectedAt,
          severity: conv.redPrepare.severity || "ORANGE",
          score: conv.redPrepare.score,
          wallets: conv.redPrepare.wallets,
          clusterKey: conv.redPrepare.clusterKey,
          reason: conv.redPrepare.reason,
          meta: conv.redPrepare.meta || {}
        });
      }
      if (conv?.redAbort && global.io) {
        global.io.to(tx.tokenAddress).emit("coordination:red-signal", {
          redSignal: "RED_ABORT",
          tokenAddress: tx.tokenAddress,
          clusterKey: conv.redAbort.clusterKey,
          severity: conv.redAbort.severity || "DIM",
          reason: conv.redAbort.reason,
          detectedAt: conv.redAbort.detectedAt
        });
      }
      if (conv?.redAlert && global.io) {
        const confirmPayload = {
          redSignal: "RED_CONFIRM",
          tokenAddress: tx.tokenAddress,
          detectedAt: conv.redAlert.detectedAt,
          severity: conv.redAlert.severity || "RED",
          score: conv.redAlert.score,
          wallets: conv.redAlert.wallets,
          clusterKey: conv.redAlert.clusterKey,
          latencyFromDeployMin: conv.redAlert.latencyFromDeployMin,
          reason: conv.redAlert.reason,
          meta: conv.redAlert.meta || {}
        };
        global.io.to(tx.tokenAddress).emit("coordination:red-signal", confirmPayload);
        global.io.to(tx.tokenAddress).emit("coordination:red-alert", confirmPayload);
      }
    }

    try {
      const supabase = getSupabase();
      const { data: watchers, error } = await supabase
        .from("wallet_stalks")
        .select("user_id, stalked_wallet")
        .eq("stalked_wallet", tx.wallet)
        .eq("is_active", true)
        .limit(100);
      if (!error && Array.isArray(watchers) && watchers.length) {
        let enrichment = buildStalkerEnrichmentFallback();
        try {
          const market = await getMarketDataMemoized(tx.tokenAddress);
          const ctx = buildScoringContext(market, tx.amount);
          enrichment = buildStalkerEnrichmentFromMarket({
            tokenAmount: Number(tx.amount),
            priceUsd: ctx.priceUsd,
            liquidityUsd: ctx.liquidityUsd
          });
        } catch (_) {}

        let f4 = {};
        try {
          f4 = await applyStalkerDoubleDown(supabase, {
            wallet: tx.wallet,
            token: tx.tokenAddress,
            amountUsd: enrichment.amountUsd,
            type: tx.type,
            signature: tx.signature
          });
        } catch (_) {}

        const stalkPayload = {
          wallet: tx.wallet,
          tokenAddress: tx.tokenAddress,
          amount: tx.amount,
          type: tx.type,
          signature: tx.signature,
          timestamp: tx.timestamp,
          enrichment: { ...enrichment, ...f4 }
        };

        if (global.io) {
          for (const w of watchers) {
            global.io.to(`user:${w.user_id}`).emit("wallet-stalk", stalkPayload);
          }
        }
      }
    } catch (_) {}

    emitted += 1;
  }

  return { emitted, droppedByGuard, signalEmitted };
}

module.exports = {
  processHeliusWebhookRaw,
  expandHeliusPayload,
  SENTINEL_SOURCE
};
