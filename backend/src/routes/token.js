const express = require("express");
const jwt = require("jsonwebtoken");
const { getMarketData } = require("../services/marketData");
const { getAnalysis } = require("../services/riskEngine");
const { getHolderConcentration, getLargestTokenAccountOwners, getTokenSecurity } = require("../services/onChainService");
const { getDeployerInfo, updateDeployerReputation } = require("../services/deployerService");
const { sendGradeAlert, sendWalletThreatAlert } = require("../bots/telegramBot");
const { getSupabase } = require("../lib/supabase");
const { getWalletSpamIntel } = require("../services/walletSpamSignals");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { getSmartWalletsForToken } = require("../services/smartMoneyService");
const { computeTerminalSignal } = require("../lib/tokenTerminalSignal");
const { getConvergenceState } = require("../services/convergenceService");
const { pairCreatedRawToUnixMs } = require("../lib/pairTime");

const router = express.Router();
const { fetchTrendingList } = require("../services/trendingList");

const TOKEN_ROUTE_FAST_TIMEOUT_MS = Math.max(350, Number(process.env.TOKEN_ROUTE_FAST_TIMEOUT_MS || 650));
const TOKEN_ROUTE_OPTIONAL_TIMEOUT_MS = Math.max(250, Number(process.env.TOKEN_ROUTE_OPTIONAL_TIMEOUT_MS || 450));

function tokenFallbacks() {
  return {
    holders: { top10Percentage: 0, totalHolders: 0, holderCountSource: "timeout", largestAccountsSampled: 0 },
    largest: { owners: [] },
    security: { mintEnabled: null, freezeEnabled: null, source: "timeout" },
    deployer: null,
    walletIntel: { level: "none", summary: "", signals: [], txSampleSize: 0, method: "timeout_fallback" },
    smartMoney: { wallets: [], meta: { source: "timeout", count: 0 } },
    convergence: { detected: false, wallets: [], threshold: 3, windowMinutes: 10 },
    private: { isWatchlist: false, notes: null }
  };
}

async function withTimeout(promise, ms, fallback, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          console.warn(`token route optional timeout: ${label}`);
          resolve(fallback);
        }, ms);
      })
    ]);
  } catch (error) {
    console.warn(`token route optional failed: ${label}:`, error.message);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getPrivateTokenData(authHeader, address) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return tokenFallbacks().private;
  const token = authHeader.split(" ")[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const supabase = getSupabase();
  const { data: watch } = await supabase
    .from("watchlists")
    .select("note")
    .eq("user_id", decoded.userId)
    .eq("token_address", address)
    .maybeSingle();
  return watch ? { isWatchlist: true, notes: watch.note } : tokenFallbacks().private;
}

router.get("/trending", async (_, res) => {
  try {
    const payload = await fetchTrendingList(6);
    return res.json(payload);
  } catch (error) {
    console.error("Trending fetch failed:", error.message);
    return res.status(500).json({ ok: false, error: "trending_fetch_failed" });
  }
});

router.get("/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const authHeader = req.headers.authorization;
    const fallback = tokenFallbacks();

    if (!address || !isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }

    res.set("Cache-Control", authHeader ? "private, max-age=30" : "public, max-age=30, stale-while-revalidate=60");

    const marketData = await getMarketData(address);
    if (!marketData)
      return res.status(404).json({ ok: false, error: "Token not found" });

    const [holdersData, largestData, tokenOnChainSec] = await Promise.all([
      withTimeout(getHolderConcentration(address), TOKEN_ROUTE_FAST_TIMEOUT_MS, fallback.holders, "holders"),
      withTimeout(getLargestTokenAccountOwners(address, 10), TOKEN_ROUTE_FAST_TIMEOUT_MS, fallback.largest, "largest_accounts"),
      withTimeout(getTokenSecurity(address), TOKEN_ROUTE_FAST_TIMEOUT_MS, fallback.security, "token_security")
    ]);
    const analysis = await getAnalysis(address, marketData, {
      holders: holdersData,
      security: tokenOnChainSec,
      cache: holdersData?.holderCountSource !== "timeout" && tokenOnChainSec?.source !== "timeout"
    });
    sendGradeAlert(address, analysis, marketData).catch((e) =>
      console.error("Telegram alert send failed:", e.message)
    );

    const deployerAddress = marketData.deployerAddress || null;

    let deployerData = null;
    if (deployerAddress) {
      updateDeployerReputation(deployerAddress).catch((e) =>
        console.error("Failed enqueue deployer reputation update:", e.message)
      );
      deployerData = await withTimeout(
        getDeployerInfo(deployerAddress),
        TOKEN_ROUTE_OPTIONAL_TIMEOUT_MS,
        null,
        "deployer_info"
      );
      if (!deployerData) {
        deployerData = {
          address: deployerAddress,
          totalLaunches: 0,
          rugCount: 0,
          riskScore: 0,
          successRate: 0,
          averageHoursToRug: null,
          deployerLabel: "First Launch",
          launchSampleSize: 0
        };
      }
    }

    const [walletIntel, smartTok, convergence, privateData] = await Promise.all([
      withTimeout(
        getWalletSpamIntel(address, {
          deployerAddress,
          deployerHistory: deployerData
        }),
        TOKEN_ROUTE_OPTIONAL_TIMEOUT_MS,
        fallback.walletIntel,
        "wallet_intel"
      ),
      withTimeout(
        getSmartWalletsForToken(address, { deployerAddress }),
        TOKEN_ROUTE_OPTIONAL_TIMEOUT_MS,
        fallback.smartMoney,
        "smart_money"
      ),
      withTimeout(
        getConvergenceState(address),
        TOKEN_ROUTE_OPTIONAL_TIMEOUT_MS,
        fallback.convergence,
        "convergence"
      ),
      withTimeout(
        getPrivateTokenData(authHeader, address),
        TOKEN_ROUTE_OPTIONAL_TIMEOUT_MS,
        fallback.private,
        "private"
      )
    ]);

    sendWalletThreatAlert(address, walletIntel, marketData).catch((e) =>
      console.error("Telegram wallet-threat alert failed:", e.message)
    );

    const topAccounts = (largestData?.owners || []).slice(0, 10).map((o, i) => ({
      rank: i + 1,
      owner: o.owner,
      pctSupply: Number(Number(o.pctSupply || 0).toFixed(4)),
      uiAmount: Number(o.uiAmount || 0)
    }));

    const security = {
      honeypot: marketData.honeypotHint === "flagged" ? "flagged" : "unknown",
      verifiedListingTag: Boolean(marketData.verifiedListingHint),
      mintRenounced: tokenOnChainSec.mintEnabled == null ? null : !tokenOnChainSec.mintEnabled,
      freezeAuthorityInactive: tokenOnChainSec.freezeEnabled == null ? null : !tokenOnChainSec.freezeEnabled,
      liquidityLocked: marketData.lpLocked,
      lpLockDetail: marketData.lpLockDetail || null,
      mintAuthorityActive: tokenOnChainSec.mintEnabled,
      freezeAuthorityActive: tokenOnChainSec.freezeEnabled
    };

    const terminal = computeTerminalSignal(analysis, marketData);

    res.json({
      ok: true,
      data: {
        market: {
          price: marketData.price,
          liquidity: marketData.liquidity,
          marketCap: marketData.marketCap,
          volume24h: marketData.volume24h,
          priceChange24h: marketData.priceChange24h,
          symbol: marketData.symbol,
          name: marketData.name,
          // Always Unix **ms** (re-normalize so seconds from any source never leak)
          pairCreatedAt: pairCreatedRawToUnixMs(marketData.pairCreatedAt) ?? null,
          lpLocked: marketData.lpLocked,
          lpLockDuration: marketData.lpLockDuration,
          lpLockDetail: marketData.lpLockDetail || null,
          contractAddress: address,
          dexPairs: marketData.dexPairs || [],
          socials: marketData.socials || { websites: [], twitter: null, telegram: null, discord: null },
          pairUrl: marketData.pairUrl || null,
          narrativeTags: marketData.narrativeTags || []
        },
        analysis,
        holders: {
          top10Percentage: holdersData.top10Percentage || 0,
          totalHolders: holdersData.totalHolders || 0,
          holderCountSource: holdersData.holderCountSource || null,
          largestAccountsSampled: holdersData.largestAccountsSampled ?? 0,
          topAccounts
        },
        security,
        terminal,
        smartMoneyForToken: (smartTok?.wallets || []).slice(0, 20),
        smartMoneyMeta: smartTok?.meta || {},
        convergence: convergence || { detected: false, wallets: [], threshold: 3, windowMinutes: 10 },
        deployer: deployerData,
        walletIntel,
        private: privateData
      },
      meta: { cached: marketData._source === "cache", staleSeconds: 0 }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;

