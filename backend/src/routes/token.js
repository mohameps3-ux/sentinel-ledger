const express = require("express");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { getMarketData } = require("../services/marketData");
const { getAnalysis } = require("../services/riskEngine");
const { getHolderConcentration } = require("../services/onChainService");
const { getDeployerInfo, updateDeployerReputation } = require("../services/deployerService");
const { sendGradeAlert, sendWalletThreatAlert } = require("../bots/telegramBot");
const { getSupabase } = require("../lib/supabase");
const { getWalletSpamIntel } = require("../services/walletSpamSignals");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");

const router = express.Router();

function deriveTrendingGrade(market) {
  const liq = Number(market?.liquidity || 0);
  const vol = Number(market?.volume24h || 0);
  const chg = Number(market?.priceChange24h || 0);
  if (liq >= 500000 && vol >= 1000000 && chg >= 5) return "A+";
  if (liq >= 200000 && vol >= 500000 && chg >= 0) return "A";
  if (liq >= 50000 && vol >= 100000) return "B";
  if (liq >= 10000) return "C";
  return "D";
}

function deriveFlowLabel(market) {
  const chg = Number(market?.priceChange24h || 0);
  const vol = Number(market?.volume24h || 0);
  if (chg >= 8 && vol >= 500000) return "Smart inflow";
  if (chg >= 0) return "Buy pressure";
  if (chg <= -8) return "Heavy sell pressure";
  return "Mixed flow";
}

router.get("/trending", async (_, res) => {
  try {
    const { data } = await axios.get("https://api.dexscreener.com/token-profiles/latest/v1", {
      timeout: 5000
    });
    const candidates = Array.isArray(data) ? data.filter((x) => x?.chainId === "solana") : [];
    const out = [];
    for (const item of candidates.slice(0, 16)) {
      const mint = item?.tokenAddress;
      if (!mint || typeof mint !== "string") continue;
      const market = await getMarketData(mint);
      if (!market || !market.symbol) continue;
      out.push({
        mint,
        symbol: market.symbol,
        price: Number(market.price || 0),
        change: Number(market.priceChange24h || 0),
        volume24h: Number(market.volume24h || 0),
        liquidity: Number(market.liquidity || 0),
        grade: deriveTrendingGrade(market),
        flowLabel: deriveFlowLabel(market)
      });
      if (out.length >= 6) break;
    }

    return res.json({
      ok: true,
      data: out,
      meta: { source: "dexscreener", count: out.length }
    });
  } catch (error) {
    console.error("Trending fetch failed:", error.message);
    return res.status(500).json({ ok: false, error: "trending_fetch_failed" });
  }
});

router.get("/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const authHeader = req.headers.authorization;

    if (!address || !isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }

    const marketData = await getMarketData(address);
    if (!marketData)
      return res.status(404).json({ ok: false, error: "Token not found" });

    const analysis = await getAnalysis(address, marketData);
    sendGradeAlert(address, analysis, marketData).catch((e) =>
      console.error("Telegram alert send failed:", e.message)
    );
    const holdersData = await getHolderConcentration(address);

    let deployerAddress = marketData.deployerAddress || null;
    if (!deployerAddress) {
      try {
        const supabase = getSupabase();
        const { data: analyzedToken } = await supabase
          .from("tokens_analyzed")
          .select("deployer_wallet")
          .eq("token_address", address)
          .maybeSingle();
        deployerAddress = analyzedToken?.deployer_wallet || null;
      } catch (e) {
        // ignore optional lookup failures
      }
    }

    let deployerData = null;
    if (deployerAddress) {
      updateDeployerReputation(deployerAddress).catch((e) =>
        console.error("Failed enqueue deployer reputation update:", e.message)
      );
      deployerData = await getDeployerInfo(deployerAddress);
      if (!deployerData) {
        deployerData = {
          address: deployerAddress,
          totalLaunches: 0,
          rugCount: 0,
          riskScore: 0
        };
      }
    }

    const walletIntel = await getWalletSpamIntel(address, {
      deployerAddress,
      deployerHistory: deployerData
    });

    sendWalletThreatAlert(address, walletIntel, marketData).catch((e) =>
      console.error("Telegram wallet-threat alert failed:", e.message)
    );

    let privateData = { isWatchlist: false, notes: null };
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const supabase = getSupabase();
        const { data: watch } = await supabase
          .from("watchlists")
          .select("note")
          .eq("user_id", decoded.userId)
          .eq("token_address", address)
          .maybeSingle();
        if (watch) privateData = { isWatchlist: true, notes: watch.note };
      } catch (e) {
        // ignore optional auth errors
      }
    }

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
          lpLocked: marketData.lpLocked,
          lpLockDuration: marketData.lpLockDuration
        },
        analysis,
        holders: {
          top10Percentage: holdersData.top10Percentage || 0,
          totalHolders: holdersData.totalHolders || 0,
          holderCountSource: holdersData.holderCountSource || null,
          largestAccountsSampled: holdersData.largestAccountsSampled ?? 0
        },
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

