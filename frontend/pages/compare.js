import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { ArrowLeftRight, BellRing, CheckCircle2, MinusCircle, Star, TrendingUp } from "lucide-react";
import { useTokenCompare } from "../hooks/useTokenCompare";
import { useTokenData } from "../hooks/useTokenData";
import { useWatchlist } from "../hooks/useWatchlist";
import { formatDateTime, formatUsdWhole } from "../lib/formatStable";
import { ProButton } from "../components/ui/ProButton";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function safeNum(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function pickBetter(left, right, higherIsBetter = true) {
  if (left === right) return "tie";
  if (higherIsBetter) return left > right ? "left" : "right";
  return left < right ? "left" : "right";
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

function MetricRow({ label, left, right, higherIsBetter = true, formatter = (v) => v }) {
  const better = pickBetter(left, right, higherIsBetter);
  return (
    <div className="grid grid-cols-[minmax(140px,1fr)_auto_auto] gap-3 items-center py-2 border-b soft-divider last:border-b-0">
      <div className="text-sm text-gray-400">{label}</div>
      <div className={`text-sm mono ${better === "left" ? "text-emerald-300" : "text-gray-200"}`}>{formatter(left)}</div>
      <div className={`text-sm mono ${better === "right" ? "text-emerald-300" : "text-gray-200"}`}>{formatter(right)}</div>
    </div>
  );
}

export default function ComparePage() {
  const router = useRouter();
  const leftParam = typeof router.query.left === "string" ? router.query.left : "";
  const rightParam = typeof router.query.right === "string" ? router.query.right : "";
  const [leftAddress, setLeftAddress] = useState(leftParam);
  const [rightAddress, setRightAddress] = useState(rightParam);
  const [watchlistLocal, setWatchlistLocal] = useState([]);
  const [rotationAlerts, setRotationAlerts] = useState([]);
  const { addToWatchlist, removeFromWatchlist, isLoading } = useWatchlist();

  const { leftQuery, rightQuery } = useTokenCompare(leftAddress, rightAddress);
  const solQuery = useTokenData(SOL_MINT);
  const usdcQuery = useTokenData(USDC_MINT);
  const leftToken = leftQuery.data?.data;
  const rightToken = rightQuery.data?.data;
  const solToken = solQuery.data?.data;
  const usdcToken = usdcQuery.data?.data;

  const leftScore = useMemo(() => scoreToken(leftToken), [leftToken]);
  const rightScore = useMemo(() => scoreToken(rightToken), [rightToken]);
  const solScore = useMemo(() => scoreToken(solToken), [solToken]);
  const usdcScore = useMemo(() => scoreToken(usdcToken), [usdcToken]);
  const winner = leftScore === rightScore ? "tie" : leftScore > rightScore ? "left" : "right";

  useEffect(() => {
    if (!router.isReady) return;
    const l = typeof router.query.left === "string" ? router.query.left : "";
    const r = typeof router.query.right === "string" ? router.query.right : "";
    if (l) setLeftAddress(l);
    if (r) setRightAddress(r);
  }, [router.isReady, router.query.left, router.query.right]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("sentinel-watchlist-cache") || "[]");
      setWatchlistLocal(saved);
      const savedAlerts = JSON.parse(localStorage.getItem("sentinel-rotation-alerts") || "[]");
      setRotationAlerts(savedAlerts.slice(0, 8));
    } catch (_) {
      setWatchlistLocal([]);
      setRotationAlerts([]);
    }
  }, []);

  useEffect(() => {
    if (!leftToken || !rightToken) return;
    const pairKey = [leftAddress.trim(), rightAddress.trim()].sort().join("|");
    if (!pairKey.includes("|")) return;
    const storageKey = "sentinel-compare-last-winner";
    let map = {};
    try {
      map = JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (_) {}

    const prevWinner = map[pairKey];
    if (prevWinner && prevWinner !== winner && winner !== "tie") {
      const selected = winner === "left" ? leftToken.market?.symbol : rightToken.market?.symbol;
      const alert = {
        id: `${Date.now()}-${pairKey}`,
        pairKey,
        selected,
        from: prevWinner,
        to: winner,
        createdAt: Date.now()
      };
      const nextAlerts = [alert, ...rotationAlerts].slice(0, 8);
      setRotationAlerts(nextAlerts);
      localStorage.setItem("sentinel-rotation-alerts", JSON.stringify(nextAlerts));
      toast(`Rotation alert: edge moved to ${selected}`);
    }
    map[pairKey] = winner;
    localStorage.setItem(storageKey, JSON.stringify(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner, leftToken, rightToken]);

  const onCompare = (e) => {
    e.preventDefault();
    router.replace(
      { pathname: "/compare", query: { left: leftAddress.trim(), right: rightAddress.trim() } },
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
        toast.success("Removed from watchlist.");
      } else {
        await addToWatchlist(mint);
        const next = [mint, ...watchlistLocal.filter((w) => w !== mint)].slice(0, 20);
        setWatchlistLocal(next);
        localStorage.setItem("sentinel-watchlist-cache", JSON.stringify(next));
        toast.success("Added to watchlist.");
      }
    } catch (_) {
      toast.error("Connect wallet/login for watchlist sync.");
    }
  };

  const loadFromWatchlist = (mint) => {
    if (!leftAddress) setLeftAddress(mint);
    else if (!rightAddress) setRightAddress(mint);
    else setRightAddress(mint);
  };

  return (
    <div className="sl-container sl-container-wide py-8 md:py-10 space-y-8">
      <section className="glass-card sl-inset">
        <div className="flex items-start gap-4 mb-8">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600/25 to-cyan-600/15 border border-purple-500/25 flex items-center justify-center shrink-0">
            <ArrowLeftRight size={22} className="text-purple-200" />
          </div>
          <div>
            <p className="sl-label">Laboratory</p>
            <h1 className="sl-h1 text-white mt-1">Token compare lab</h1>
            <p className="sl-body sl-muted mt-2 max-w-2xl">
              Paste two mints and run a full differential — grades, liquidity, holders and deployer risk.
            </p>
          </div>
        </div>
        <form onSubmit={onCompare} className="grid md:grid-cols-[1fr_1fr_auto] gap-4 items-stretch md:items-end">
          <div>
            <p className="sl-label mb-2">Token A</p>
            <input
              value={leftAddress}
              onChange={(e) => setLeftAddress(e.target.value)}
              placeholder="Mint address…"
              className="sl-input h-12 px-4"
            />
          </div>
          <div>
            <p className="sl-label mb-2">Token B</p>
            <input
              value={rightAddress}
              onChange={(e) => setRightAddress(e.target.value)}
              placeholder="Mint address…"
              className="sl-input h-12 px-4"
            />
          </div>
          <ProButton type="submit" className="h-12 md:mb-0 w-full md:w-auto justify-center">
            Compare
          </ProButton>
        </form>
      </section>

      <section className="glass-card sl-inset">
        <div className="flex items-center gap-3 mb-5">
          <Star size={18} className="text-purple-300" />
          <h2 className="sl-h2 text-white">Watchlist comparables</h2>
        </div>
        {!watchlistLocal.length ? (
          <div className="text-sm text-gray-500">No cached watchlist yet. Add tokens from compare cards below.</div>
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

      <section className="grid md:grid-cols-2 gap-4">
        {[leftToken, rightToken].map((token, idx) => (
          <div key={idx} className="glass-card sl-inset flex flex-col gap-5" translate="no">
            {!token ? (
              <div className="sl-body sl-muted py-6 text-center">No data available yet.</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="sl-label">Symbol</p>
                    <div className="sl-h2 text-white mt-1" translate="no">
                      {token.market?.symbol || "TOKEN"}
                    </div>
                    <div className="text-[12px] text-gray-500 mono mt-2">
                      {(idx === 0 ? leftAddress : rightAddress).slice(0, 6)}…
                      {(idx === 0 ? leftAddress : rightAddress).slice(-4)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="sl-label">Sentinel score</p>
                    <div className="text-3xl font-bold text-white mt-1">{idx === 0 ? leftScore : rightScore}</div>
                  </div>
                </div>
                <div className="sl-divider" />
                <div className="sl-body text-gray-300">
                  Grade <span className="font-semibold text-white">{token.analysis?.grade || "—"}</span>
                  <span className="text-gray-600 mx-2">·</span>
                  Confidence{" "}
                  <span className="font-semibold text-white">{safeNum(token.analysis?.confidence)}%</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleWatch(idx === 0 ? leftAddress : rightAddress)}
                  disabled={isLoading}
                  className={
                    watchlistLocal.includes((idx === 0 ? leftAddress : rightAddress).trim())
                      ? "btn-ghost self-start !py-2 !text-[13px]"
                      : "btn-pro btn-pro-sm self-start"
                  }
                >
                  {watchlistLocal.includes((idx === 0 ? leftAddress : rightAddress).trim())
                    ? "Remove from watchlist"
                    : "Add to watchlist"}
                </button>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="glass-card sl-inset overflow-x-auto">
        <h2 className="sl-h2 text-white mb-6">Differential metrics</h2>
        {!leftToken || !rightToken ? (
          <div className="text-sm text-gray-500">Load both tokens to see side-by-side metrics.</div>
        ) : (
          <div className="min-w-[360px]">
            <div className="grid grid-cols-[minmax(140px,1fr)_auto_auto] gap-3 pb-2 mb-1 border-b soft-divider text-xs uppercase tracking-wide text-gray-500">
              <span>Metric</span>
              <span>A</span>
              <span>B</span>
            </div>
            <MetricRow
              label="Sentinel score"
              left={leftScore}
              right={rightScore}
              formatter={(v) => `${v}/100`}
            />
            <MetricRow
              label="Confidence"
              left={safeNum(leftToken.analysis?.confidence)}
              right={safeNum(rightToken.analysis?.confidence)}
              formatter={(v) => `${v}%`}
            />
            <MetricRow
              label="Liquidity"
              left={safeNum(leftToken.market?.liquidity)}
              right={safeNum(rightToken.market?.liquidity)}
              formatter={(v) => `$${formatUsdWhole(v)}`}
            />
            <MetricRow
              label="24h volume"
              left={safeNum(leftToken.market?.volume24h)}
              right={safeNum(rightToken.market?.volume24h)}
              formatter={(v) => `$${formatUsdWhole(v)}`}
            />
            <MetricRow
              label="Top10 concentration (lower better)"
              left={safeNum(leftToken.holders?.top10Percentage)}
              right={safeNum(rightToken.holders?.top10Percentage)}
              higherIsBetter={false}
              formatter={(v) => `${v.toFixed(1)}%`}
            />
            <MetricRow
              label="Deployer risk (lower better)"
              left={safeNum(leftToken.deployer?.riskScore)}
              right={safeNum(rightToken.deployer?.riskScore)}
              higherIsBetter={false}
              formatter={(v) => `${v}/100`}
            />
          </div>
        )}
      </section>

      <section className="glass-card p-5 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-3">Benchmark vs SOL / USDC</h2>
        {!leftToken || !rightToken ? (
          <div className="text-sm text-gray-500">Load both tokens to benchmark against majors.</div>
        ) : (
          <div className="space-y-2 text-sm min-w-[360px]">
            <div className="grid grid-cols-[minmax(140px,1fr)_auto_auto] gap-3 pb-2 mb-1 border-b soft-divider text-xs uppercase tracking-wide text-gray-500">
              <span>Relative edge</span>
              <span>A</span>
              <span>B</span>
            </div>
            <MetricRow
              label="vs SOL score delta"
              left={leftScore - solScore}
              right={rightScore - solScore}
              formatter={(v) => `${v >= 0 ? "+" : ""}${v}`}
            />
            <MetricRow
              label="vs USDC score delta"
              left={leftScore - usdcScore}
              right={rightScore - usdcScore}
              formatter={(v) => `${v >= 0 ? "+" : ""}${v}`}
            />
          </div>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="text-lg font-semibold mb-2">Entry / Exit ranking</h2>
        {!leftToken || !rightToken ? (
          <div className="text-sm text-gray-500">Ranking appears after both tokens are loaded.</div>
        ) : winner === "tie" ? (
          <div className="text-sm text-amber-300 inline-flex items-center gap-2">
            <MinusCircle size={14} />
            Both setups are tied. Wait for new flow/volume confirmation.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-emerald-300 inline-flex items-center gap-2">
              <CheckCircle2 size={14} />
              Prefer{" "}
              <strong translate="no">{winner === "left" ? leftToken.market?.symbol : rightToken.market?.symbol}</strong>{" "}
              for entry setup.
            </div>
            <div className="text-sm text-gray-300 inline-flex items-center gap-2">
              <TrendingUp size={14} />
              Keep the weaker setup in watchlist and wait for confirmation before sizing.
            </div>
          </div>
        )}
      </section>

      <section className="glass-card p-5" translate="no">
        <div className="flex items-center gap-2 mb-3">
          <BellRing size={16} className="text-purple-300" />
          <h2 className="text-lg font-semibold">Rotation Alerts</h2>
        </div>
        {!rotationAlerts.length ? (
          <div className="text-sm text-gray-500">No rotation changes detected yet.</div>
        ) : (
          <div className="space-y-2">
            {rotationAlerts.map((alert) => (
              <div key={alert.id} className="bg-[#0E1318] border soft-divider rounded-xl px-3 py-2 text-sm">
                <span className="text-gray-300">Edge rotated to </span>
                <span className="text-emerald-300 font-semibold">{alert.selected}</span>
                <span className="text-gray-500"> · {formatDateTime(alert.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

