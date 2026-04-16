const express = require("express");
const jwt = require("jsonwebtoken");
const { getMarketData } = require("../services/marketData");
const { getAnalysis } = require("../services/riskEngine");
const { getHolderConcentration } = require("../services/onChainService");
const { getDeployerInfo, updateDeployerReputation } = require("../services/deployerService");
const { sendGradeAlert, sendWalletThreatAlert } = require("../bots/telegramBot");
const { getSupabase } = require("../lib/supabase");
const { getWalletSpamIntel } = require("../services/walletSpamSignals");

const router = express.Router();

router.get("/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const authHeader = req.headers.authorization;

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
          totalHolders: holdersData.totalHolders || 0
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

