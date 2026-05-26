import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSmartWalletsLeaderboard } from "../hooks/useSmartWalletsLeaderboard";
import { useSmartMoneyActivity } from "../hooks/useSmartMoneyActivity";
import { useWalletLabels } from "../hooks/useWalletLabels";
import { useWalletFavorites } from "../hooks/useWalletFavorites";
import { PageHead } from "../components/seo/PageHead";
import { SmartMoneyLeaderboardConsole } from "../components/smart-money/SmartMoneyLeaderboardConsole";
import { useLocale } from "../contexts/LocaleContext";
import { walletNarrativeApiLang } from "../lib/walletNarrativeLang";

function parseLimitFromQuery(raw) {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null || s === "") return 50;
  const n = Number(s);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, Math.round(n)));
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function activityInTimeframe(createdAt, tf) {
  if (!createdAt) return true;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return true;
  const now = Date.now();
  const key = String(tf || "24h").toLowerCase();
  const ms = key === "24h" ? 86400000 : key === "7d" ? 86400000 * 7 : 86400000 * 30;
  return now - t <= ms;
}

export default function SmartMoneyPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const derivedNarrative = walletNarrativeApiLang(locale);
  const [narrativeOverride, setNarrativeOverride] = useState(null);
  const narrativeLang = narrativeOverride ?? derivedNarrative;
  const [chain, setChain] = useState("solana");
  const [minWinRate, setMinWinRate] = useState(0);
  const [minTrades, setMinTrades] = useState(0);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [timeframe, setTimeframe] = useState("24h");
  // Profitable-only mode: when ON, send minPnl30d=0 to the leaderboard so
  // wallets with negative 30d PnL are filtered out at the SQL level. Default
  // ON because the explicit user goal is "wallets rentables".
  const [profitableOnly, setProfitableOnly] = useState(true);

  useEffect(() => {
    setUrlHydrated(true);
  }, []);

  useEffect(() => {
    setNarrativeOverride(null);
  }, [locale]);

  const limit = useMemo(() => {
    if (!urlHydrated) return 50;
    if (!router.isReady) return 50;
    return parseLimitFromQuery(router.query.limit);
  }, [urlHydrated, router.isReady, router.query.limit]);

  const soloFavorites = useMemo(() => {
    if (!urlHydrated) return false;
    if (!router.isReady) return false;
    const f = router.query.favorites;
    const s = Array.isArray(f) ? f[0] : f;
    return s === "1" || s === "true";
  }, [urlHydrated, router.isReady, router.query.favorites]);

  // Honour ?profitable=0 to opt out of the profitable-only default (e.g. for
  // research, showing the full universe including money-losing bots).
  useEffect(() => {
    if (!urlHydrated || !router.isReady) return;
    const raw = router.query.profitable;
    const s = Array.isArray(raw) ? raw[0] : raw;
    if (s === "0" || s === "false") {
      setProfitableOnly(false);
    } else if (s === "1" || s === "true") {
      setProfitableOnly(true);
    }
  }, [urlHydrated, router.isReady, router.query.profitable]);

  const pushQuery = useCallback(
    (patch) => {
      if (!router.isReady) return;
      const next = { ...router.query, ...patch };
      Object.keys(next).forEach((k) => {
        if (next[k] === undefined || next[k] === "") delete next[k];
      });
      router.push({ pathname: "/smart-money", query: next }, undefined, { shallow: true });
    },
    [router]
  );

  const { data, isLoading, isError, error, refetch } = useSmartWalletsLeaderboard({
    chain,
    minWinRate,
    minTrades,
    minPnl30d: profitableOnly ? 0 : null,
    limit,
    refetchInterval: 5000
  });
  const activity = useSmartMoneyActivity(48, { refetchInterval: 5000 });
  const { isFavorite, toggle: toggleFavorite, favorites: favList } = useWalletFavorites();
  const favKey = favList.join(",");

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const actRows = Array.isArray(activity.data?.rows) ? activity.data.rows : [];

  // Server-reported universe size (independent of page limit) so the hero strip
  // shows the real total instead of always echoing the page size (50).
  const totalSmartWallets = useMemo(() => {
    const n = Number(data?.meta?.totalSmartWallets);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [data?.meta?.totalSmartWallets]);

  // Server-counted active probes in the last 24h (NOT capped by the activity page limit).
  const activeProbes24hServer = useMemo(() => {
    const n = Number(activity.data?.meta?.activeProbes24h);
    return Number.isFinite(n) ? n : null;
  }, [activity.data?.meta?.activeProbes24h]);

  // Freshness: when was the underlying smart-money universe last computed?
  // Pick the freshest of leaderboard.meta.dataComputedAt and activity.meta.dataComputedAt.
  const dataComputedAt = useMemo(() => {
    const a = data?.meta?.dataComputedAt;
    const b = activity.data?.meta?.dataComputedAt;
    if (!a) return b || null;
    if (!b) return a;
    return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
  }, [data?.meta?.dataComputedAt, activity.data?.meta?.dataComputedAt]);

  const addresses = useMemo(() => rows.map((r) => r.wallet).filter(Boolean), [rows]);
  const { labelFor, titleFor } = useWalletLabels(addresses);

  const ranked = useMemo(
    () =>
      rows.map((w, i) => ({
        ...w,
        rank: i + 1
      })),
    [rows]
  );

  const displayedRanked = useMemo(() => {
    const list = soloFavorites ? ranked.filter((w) => isFavorite(w.wallet)) : ranked;
    return list.map((w, i) => {
      const globalRank = w.rank;
      return {
        ...w,
        rank: i + 1,
        globalRank
      };
    });
  }, [ranked, soloFavorites, isFavorite, favKey]);

  const medianWinRate = useMemo(() => {
    if (!displayedRanked.length) return null;
    return median(displayedRanked.map((w) => Number(w.winRate || 0)));
  }, [displayedRanked]);

  // PnL distribution across smart wallets is brutally skewed (a single high-volume
  // bot with -$2,210 can dominate the mean over 10 wallets). Use the median as the
  // headline number — same convention as Nansen / Bloomberg for non-normal samples.
  // The mean is kept around as `meanPnl30` and surfaced in tooltips/secondary copy.
  const medianPnl30 = useMemo(() => {
    if (!displayedRanked.length) return null;
    return median(displayedRanked.map((w) => Number(w.pnl30d || 0)));
  }, [displayedRanked]);

  const meanPnl30 = useMemo(() => {
    if (!displayedRanked.length) return null;
    const sum = displayedRanked.reduce((a, w) => a + Number(w.pnl30d || 0), 0);
    return sum / displayedRanked.length;
  }, [displayedRanked]);

  // Same reasoning for the unified score: median over a skewed sample tells a
  // truer story than the mean.
  const unifiedScoreNums = useMemo(() => {
    return displayedRanked
      .map((w) => {
        const u = w.unifiedScore != null ? Number(w.unifiedScore) : null;
        if (u != null && Number.isFinite(u)) return u;
        const s = w.score != null ? Number(w.score) : null;
        if (s != null && Number.isFinite(s)) return s;
        return null;
      })
      .filter((n) => n != null);
  }, [displayedRanked]);

  const medianUnifiedScore = useMemo(() => {
    if (!unifiedScoreNums.length) return null;
    return median(unifiedScoreNums);
  }, [unifiedScoreNums]);

  const meanUnifiedScore = useMemo(() => {
    if (!unifiedScoreNums.length) return null;
    return unifiedScoreNums.reduce((a, b) => a + b, 0) / unifiedScoreNums.length;
  }, [unifiedScoreNums]);

  // Prefer the server-counted value (never capped). Fall back to a client-side count
  // (capped at activity page limit) only if the server didn't provide one.
  const activeProbes24h = useMemo(() => {
    if (activeProbes24hServer != null) return activeProbes24hServer;
    return actRows.filter((r) => activityInTimeframe(r.createdAt, "24h")).length;
  }, [activeProbes24hServer, actRows]);

  // Compose a single "refresh everything" action so the UI can offer a manual cache-bust.
  const refreshAll = useCallback(() => {
    try { refetch?.(); } catch (_) {}
    try { activity.refetch?.(); } catch (_) {}
  }, [refetch, activity.refetch]);

  return (
    <>
      <PageHead title={t("smart.pageTitle")} description={t("smart.pageDesc")} />
      <div className="min-h-screen overflow-x-hidden bg-[#090C11] text-zinc-100">
        <SmartMoneyLeaderboardConsole
          displayedRanked={displayedRanked}
          soloFavorites={soloFavorites}
          isLoadingLeaderboard={isLoading}
          leaderboardError={isError ? error : null}
          activityRows={actRows}
          activityLoading={activity.isLoading}
          activityError={activity.isError ? activity.error : null}
          activityRefetch={activity.refetch}
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          pushQuery={pushQuery}
          routerReady={router.isReady}
          limit={limit}
          chain={chain}
          setChain={setChain}
          minWinRate={minWinRate}
          setMinWinRate={setMinWinRate}
          minTrades={minTrades}
          setMinTrades={setMinTrades}
          narrativeLang={narrativeLang}
          derivedNarrative={derivedNarrative}
          setNarrativeOverride={setNarrativeOverride}
          refetchLeaderboard={refetch}
          labelFor={labelFor}
          titleFor={titleFor}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
          medianWinRate={medianWinRate}
          medianPnl30={medianPnl30}
          meanPnl30={meanPnl30}
          medianUnifiedScore={medianUnifiedScore}
          meanUnifiedScore={meanUnifiedScore}
          activeProbes24h={activeProbes24h}
          totalSmartWallets={totalSmartWallets}
          dataComputedAt={dataComputedAt}
          onRefreshAll={refreshAll}
          profitableOnly={profitableOnly}
          setProfitableOnly={(next) => {
            setProfitableOnly(next);
            pushQuery({ profitable: next ? undefined : "0" });
          }}
          rawRowCount={rows.length}
          onClearFavoritesFilter={() => pushQuery({ favorites: undefined })}
          t={t}
        />
      </div>
    </>
  );
}
