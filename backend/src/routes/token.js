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

const router = express.Router();
const { fetchTrendingList } = require("../services/trendingList");

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

    if (!address || !isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }

    const marketData = await getMarketData(address);
    if (!marketData)
      return res.status(404).json({ ok: false, error: "Token not found" });

    const [analysis, holdersData, largestData, tokenOnChainSec] = await Promise.all([
      getAnalysis(address, marketData),
      getHolderConcentration(address),
      getLargestTokenAccountOwners(address, 10),
      getTokenSecurity(address)
    ]);
    sendGradeAlert(address, analysis, marketData).catch((e) =>
      console.error("Telegram alert send failed:", e.message)
    );

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

    const [walletIntel, smartTok] = await Promise.all([
      getWalletSpamIntel(address, {
        deployerAddress,
        deployerHistory: deployerData
      }),
      getSmartWalletsForToken(address)
    ]);

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

    const topAccounts = (largestData?.owners || []).slice(0, 10).map((o, i) => ({
      rank: i + 1,
      owner: o.owner,
      pctSupply: Number(Number(o.pctSupply || 0).toFixed(4)),
      uiAmount: Number(o.uiAmount || 0)
    }));

    const security = {
      honeypot: marketData.honeypotHint === "flagged" ? "flagged" : "unknown",
      verifiedListingTag: Boolean(marketData.verifiedListingHint),
      mintRenounced: !tokenOnChainSec.mintEnabled,
      freezeAuthorityInactive: !tokenOnChainSec.freezeEnabled,
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
          lpLocked: marketData.lpLocked,
          lpLockDuration: marketData.lpLockDuration,
          lpLockDetail: marketData.lpLockDetail || null,
          contractAddress: address,
          dexPairs: marketData.dexPairs || [],
          socials: marketData.socials || { websites: [], twitter: null, telegram: null, discord: null },
          pairUrl: marketData.pairUrl || null
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

