import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useQueries } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeftRight, CheckCircle2, Eye, Radio, Star, TrendingUp } from "lucide-react";
import { useWatchlist } from "../hooks/useWatchlist";
import { formatUsdWhole } from "../lib/formatStable";
import { ProButton } from "../components/ui/ProButton";
import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { isProbableSolanaMint } from "../lib/solanaMint.mjs";
import { buildJupiterSwapUrl, EXTERNAL_ANCHOR_REL } from "../lib/terminalLinks";

function safeNum(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function scoreToken(token) {
  const gradeScore = { "A+": 100, A: 92, B: 80, C: 65, D: 45, F: 20 }[token?.analysis?.grade] || 0;
  const confidence = safeNum(token?.analysis?.confidence);
  const liquidityScore = Math.min(100, safeNum(token?.market?.liquidity) / 500);
  const concentrationPenalty = Math.min(50, safeNum(token?.holders?.top10Percentage));
  const deployerPenalty = Math.min(50, safeNum(token?.deployer?.riskScore) * 0.5);
  const raw = gradeScore * 0.45 + confidence * 0.25 + liquidityScore * 0.2 - concentrationPenalty * 0.06 - deployerPenalty * 0.04;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function compactMint(mint) {
  if (!mint) return "—";
  return `${mint.slice(0, 5)}…${mint.slice(-4)}`;
}

function parseTokenList(query) {
  const rawTokens = typeof query.tokens === "string" ? query.tokens : "";
  const fromTokens = rawTokens.split(",").map((s) => s.trim()).filter(Boolean);
  const legacy = [query.left, query.right].filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim());
  return [...new Set([...(fromTokens.length ? fromTokens : legacy)])].filter(isProbableSolanaMint).slice(0, 4);
}

async function fetchToken(address, authToken) {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const res = await fetch(`${getPublicApiUrl()}/api/v1/token/${address}`, { headers });
  if (!res.ok) throw new Error("Failed to fetch token");
  return res.json();
}

function metricValue(token, key) {
  if (key === "score") return scoreToken(token);
  if (key === "confidence") return safeNum(token?.analysis?.confidence);
  if (key === "liquidity") return safeNum(token?.market?.liquidity);
  if (key === "volume") return safeNum(token?.market?.volume24h);
  if (key === "holders") return safeNum(token?.holders?.top10Percentage);
  if (key === "deployer") return safeNum(token?.deployer?.riskScore);
  return 0;
}

function metricDisplay(value, key) {
  if (key === "liquidity" || key === "volume") return `$${formatUsdWhole(value)}`;
  if (key === "confidence" || key === "holders") return `${Number(value).toFixed(key === "holders" ? 1 : 0)}%`;
  if (key === "deployer") return `${Number(value).toFixed(0)}/100`;
  return `${value}/100`;
}

export default function ComparePage() {
  const { t } = useLocale();
  const router = useRouter();
  const clientToken = useClientAuthToken();
  const [slots, setSlots] = useState(["", "", "", ""]);
  const [chosenMint, setChosenMint] = useState("");
  const [watchlistLocal, setWatchlistLocal] = useState([]);
  const { addToWatchlist, removeFromWatchlist, isLoading } = useWatchlist();

  const mints = useMemo(() => [...new Set(slots.map((s) => s.trim()).filter(isProbableSolanaMint))].slice(0, 4), [slots]);
  const tokenQueries = useQueries({
    queries: mints.map((mint) => ({
      queryKey: ["compare-choice", mint, clientToken ? "auth" : "anon"],
      queryFn: () => fetchToken(mint, clientToken),
      staleTime: 30000
    }))
  });
  const loaded = useMemo(
    () =>
      mints
        .map((mint, idx) => ({ mint, token: tokenQueries[idx]?.data?.data || null, isLoading: tokenQueries[idx]?.isLoading }))
        .filter((row) => row.token),
    [mints, tokenQueries]
  );
  const ranked = useMemo(
    () =>
      loaded
        .map((row) => ({ ...row, score: scoreToken(row.token) }))
        .sort((a, b) => b.score - a.score),
    [loaded]
  );
  const recommended = ranked[0] || null;
  const chosen = loaded.find((row) => row.mint === chosenMint) || recommended;
  const watchCtaLabel = loaded.length <= 2 ? t("compare.cta.watchBoth") : t("compare.cta.watchAll");

  useEffect(() => {
    if (!router.isReady) return;
    const next = parseTokenList(router.query);
    if (next.length) setSlots([next[0] || "", next[1] || "", next[2] || "", next[3] || ""]);
  }, [router.isReady, router.query]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("sentinel-watchlist-cache") || "[]");
      setWatchlistLocal(saved);
    } catch (_) {
      setWatchlistLocal([]);
    }
  }, []);

  useEffect(() => {
    if (!chosenMint && recommended?.mint) setChosenMint(recommended.mint);
  }, [chosenMint, recommended?.mint]);

  const onCompare = (e) => {
    e.preventDefault();
    const next = [...new Set(slots.map((s) => s.trim()).filter(isProbableSolanaMint))].slice(0, 4);
    router.replace(
      { pathname: "/compare", query: next.length ? { tokens: next.join(",") } : {} },
      undefined,
      { shallow: true }
    );
  };

  const toggleWatch = async (address) => {
    const mint = (address || "").trim();
    if (mint.length < 32) return;
    try {
      const exists = watchlistLocal.includes(mint);
      if (exists) {
        await removeFromWatchlist(mint);
        const next = watchlistLocal.filter((w) => w !== mint);
        setWatchlistLocal(next);
        localStorage.setItem("sentinel-watchlist-cache", JSON.stringify(next));
        toast.success(t("compare.toast.removed"));
      } else {
        await addToWatchlist(mint);
        const next = [mint, ...watchlistLocal.filter((w) => w !== mint)].slice(0, 20);
        setWatchlistLocal(next);
        localStorage.setItem("sentinel-watchlist-cache", JSON.stringify(next));
        toast.success(t("compare.toast.added"));
      }
    } catch (_) {
      toast.error(t("compare.toast.watchErr"));
    }
  };

  const loadFromWatchlist = (mint) => {
    setSlots((prev) => {
      if (prev.includes(mint)) return prev;
      const empty = prev.findIndex((v) => !v.trim());
      if (empty >= 0) {
        const next = [...prev];
        next[empty] = mint;
        return next;
      }
      return [prev[0], prev[1], prev[2], mint];
    });
  };

  const watchAllLoaded = async () => {
    const targets = loaded.map((row) => row.mint).filter((mint) => !watchlistLocal.includes(mint));
    if (!targets.length) return;
    try {
      for (const mint of targets) await addToWatchlist(mint);
      const next = [...targets, ...watchlistLocal.filter((w) => !targets.includes(w))].slice(0, 20);
      setWatchlistLocal(next);
      localStorage.setItem("sentinel-watchlist-cache", JSON.stringify(next));
      toast.success(t("compare.toast.watchAll"));
    } catch (_) {
      toast.error(t("compare.toast.watchErr"));
    }
  };

  return (
    <>
      <PageHead title={t("compare.pageTitle")} description={t("compare.pageDesc")} />
    <div className="sl-container sl-container-wide py-8 md:py-10 space-y-8">
      <section className="glass-card sl-inset">
        <div className="flex items-start gap-4 mb-8">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600/25 to-cyan-600/15 border border-purple-500/25 flex items-center justify-center shrink-0">
            <ArrowLeftRight size={22} className="text-purple-200" />
          </div>
          <div>
            <p className="sl-label">{t("compare.hero.label")}</p>
            <h1 className="sl-h1 text-white mt-1">{t("compare.hero.h1")}</h1>
            <p className="sl-body sl-muted mt-2 max-w-2xl">{t("compare.hero.body")}</p>
          </div>
        </div>
        <form onSubmit={onCompare} className="grid md:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-3 items-stretch md:items-end">
          {slots.map((value, idx) => (
            <div key={idx}>
              <p className="sl-label mb-2">{t("compare.form.slot", { n: idx + 1 })}</p>
              <input
                value={value}
                onChange={(e) => {
                  const next = [...slots];
                  next[idx] = e.target.value;
                  setSlots(next);
                }}
                placeholder={t("compare.form.placeholder")}
                className="sl-input h-11 px-3 font-mono text-xs"
              />
            </div>
          ))}
          <ProButton type="submit" className="h-11 md:mb-0 w-full md:w-auto justify-center">
            {t("compare.form.submit")}
          </ProButton>
        </form>
      </section>

      <section className="border border-white/[0.08] bg-[#07080b] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-gray-500">{t("compare.decision.title")}</p>
            <p className="text-[11px] text-gray-500 mt-1">{t("compare.decision.body")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {chosen?.mint ? (
              <a
                href={buildJupiterSwapUrl(chosen.mint)}
                target="_blank"
                rel={EXTERNAL_ANCHOR_REL}
                className="px-3 py-2 rounded-md border border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-100 text-xs font-semibold"
              >
                {t("compare.cta.tradeChosen")}
              </a>
            ) : null}
            <button
              type="button"
              onClick={watchAllLoaded}
              disabled={!loaded.length || isLoading}
              className="px-3 py-2 rounded-md border border-white/12 bg-white/[0.03] text-gray-200 text-xs font-semibold disabled:opacity-40"
            >
              {watchCtaLabel}
            </button>
          </div>
        </div>

        {!loaded.length ? (
          <div className="px-4 py-8 text-sm text-gray-500">{t("compare.decision.empty")}</div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
            {ranked.map((row, idx) => {
              const token = row.token;
              const chosenNow = chosen?.mint === row.mint;
              const symbol = token.market?.symbol || "TOKEN";
              return (
                <article
                  key={row.mint}
                  className={`p-4 min-h-[15rem] ${chosenNow ? "bg-cyan-500/[0.04]" : "bg-transparent"}`}
                  translate="no"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-500 font-mono">#{idx + 1}</p>
                      <h2 className="text-lg font-semibold text-white truncate mt-1">{symbol}</h2>
                      <p className="text-[10px] text-gray-500 font-mono mt-1">{compactMint(row.mint)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[9px] uppercase tracking-wider text-gray-500">{t("compare.card.score")}</p>
                      <p className="text-3xl font-black font-mono text-white">{row.score}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-md border border-white/[0.07] bg-black/25 px-2 py-1.5">
                      <p className="text-gray-500">{t("compare.card.grade")}</p>
                      <p className="font-mono text-gray-100">{token.analysis?.grade || "—"}</p>
                    </div>
                    <div className="rounded-md border border-white/[0.07] bg-black/25 px-2 py-1.5">
                      <p className="text-gray-500">{t("compare.card.confidence")}</p>
                      <p className="font-mono text-gray-100">{safeNum(token.analysis?.confidence)}%</p>
                    </div>
                    <div className="rounded-md border border-white/[0.07] bg-black/25 px-2 py-1.5">
                      <p className="text-gray-500">{t("compare.metric.liquidity")}</p>
                      <p className="font-mono text-gray-100">${formatUsdWhole(safeNum(token.market?.liquidity))}</p>
                    </div>
                    <div className="rounded-md border border-white/[0.07] bg-black/25 px-2 py-1.5">
                      <p className="text-gray-500">{t("compare.metric.top10")}</p>
                      <p className="font-mono text-gray-100">{safeNum(token.holders?.top10Percentage).toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setChosenMint(row.mint)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-semibold ${
                        chosenNow
                          ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                          : "border-white/12 bg-white/[0.03] text-gray-300 hover:text-white"
                      }`}
                    >
                      {chosenNow ? t("compare.cta.chosen") : t("compare.cta.choose")}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleWatch(row.mint)}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-md border border-white/12 text-xs text-gray-300 hover:text-white disabled:opacity-40"
                    >
                      {watchlistLocal.includes(row.mint) ? t("compare.watch.remove") : t("compare.watch.add")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-card sl-inset">
        <div className="flex items-center gap-3 mb-5">
          <Star size={18} className="text-purple-300" />
          <h2 className="sl-h2 text-white">{t("compare.watchlist.h2")}</h2>
        </div>
        {!watchlistLocal.length ? (
          <div className="text-sm text-gray-500">{t("compare.watchlist.empty")}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {watchlistLocal.map((mint) => (
              <button
                key={mint}
                onClick={() => loadFromWatchlist(mint)}
                className="text-xs mono px-2.5 py-1 rounded-full bg-white/5 border soft-divider text-gray-300 hover:text-white hover:border-purple-500/40 transition"
                title={mint}
              >
                {mint.slice(0, 6)}...{mint.slice(-4)}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="glass-card sl-inset overflow-x-auto">
        <div className="flex items-center gap-2 mb-5">
          <Radio size={16} className="text-cyan-300" />
          <h2 className="sl-h2 text-white">{t("compare.metrics.h2")}</h2>
        </div>
        {ranked.length < 2 ? (
          <div className="text-sm text-gray-500">{t("compare.metrics.loadBoth")}</div>
        ) : (
          <div className="min-w-[560px]">
            <div className="grid gap-3 pb-2 mb-1 border-b soft-divider text-xs uppercase tracking-wide text-gray-500" style={{ gridTemplateColumns: `minmax(150px,1fr) repeat(${ranked.length}, minmax(86px, auto))` }}>
              <span>{t("compare.metrics.th.metric")}</span>
              {ranked.map((row) => <span key={row.mint}>{row.token.market?.symbol || compactMint(row.mint)}</span>)}
            </div>
            {[
              ["score", t("compare.metric.score")],
              ["confidence", t("compare.metric.confidence")],
              ["liquidity", t("compare.metric.liquidity")],
              ["volume", t("compare.metric.vol24")],
              ["holders", t("compare.metric.top10")],
              ["deployer", t("compare.metric.deployer")]
            ].map(([key, label]) => {
              const values = ranked.map((row) => metricValue(row.token, key));
              const lowerBetter = key === "holders" || key === "deployer";
              const best = lowerBetter ? Math.min(...values) : Math.max(...values);
              return (
                <div key={key} className="grid gap-3 items-center py-2 border-b soft-divider last:border-b-0" style={{ gridTemplateColumns: `minmax(150px,1fr) repeat(${ranked.length}, minmax(86px, auto))` }}>
                  <div className="text-sm text-gray-400">{label}</div>
                  {ranked.map((row) => {
                    const v = metricValue(row.token, key);
                    return (
                      <div key={row.mint} className={`text-sm mono ${v === best ? "text-emerald-300" : "text-gray-200"}`}>
                        {metricDisplay(v, key)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="text-lg font-semibold mb-2">{t("compare.ranking.h2")}</h2>
        {!recommended ? (
          <div className="text-sm text-gray-500">{t("compare.ranking.wait")}</div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-emerald-300 inline-flex items-center gap-2">
              <CheckCircle2 size={14} />
              {t("compare.ranking.preferBefore")}{" "}
              <strong translate="no">{recommended.token.market?.symbol || compactMint(recommended.mint)}</strong>{" "}
              {t("compare.ranking.preferAfter")}
            </div>
            <div className="text-sm text-gray-300 inline-flex items-center gap-2">
              <TrendingUp size={14} />
              {t("compare.ranking.weaker")}
            </div>
            <div className="text-sm text-gray-400 inline-flex items-center gap-2">
              <Eye size={14} />
              {t("compare.ranking.watchRest")}
            </div>
          </div>
        )}
      </section>
    </div>
    </>
  );
}

