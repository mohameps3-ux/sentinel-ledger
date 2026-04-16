import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeftRight, CheckCircle2, MinusCircle, TrendingUp } from "lucide-react";
import { useTokenCompare } from "../hooks/useTokenCompare";

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
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2 border-b soft-divider last:border-b-0">
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

  const { leftQuery, rightQuery } = useTokenCompare(leftAddress, rightAddress);
  const leftToken = leftQuery.data?.data;
  const rightToken = rightQuery.data?.data;

  const leftScore = useMemo(() => scoreToken(leftToken), [leftToken]);
  const rightScore = useMemo(() => scoreToken(rightToken), [rightToken]);
  const winner = leftScore === rightScore ? "tie" : leftScore > rightScore ? "left" : "right";

  const onCompare = (e) => {
    e.preventDefault();
    router.replace(
      { pathname: "/compare", query: { left: leftAddress.trim(), right: rightAddress.trim() } },
      undefined,
      { shallow: true }
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      <section className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight size={18} className="text-purple-300" />
          <h1 className="text-2xl font-bold">Token Compare Lab</h1>
        </div>
        <form onSubmit={onCompare} className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
          <input
            value={leftAddress}
            onChange={(e) => setLeftAddress(e.target.value)}
            placeholder="Token A mint address"
            className="h-11 rounded-xl bg-[#0E1318] border soft-divider px-4 text-sm focus:outline-none focus:border-purple-500"
          />
          <input
            value={rightAddress}
            onChange={(e) => setRightAddress(e.target.value)}
            placeholder="Token B mint address"
            className="h-11 rounded-xl bg-[#0E1318] border soft-divider px-4 text-sm focus:outline-none focus:border-purple-500"
          />
          <button className="h-11 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 font-semibold hover:opacity-90 transition">
            Compare
          </button>
        </form>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {[leftToken, rightToken].map((token, idx) => (
          <div key={idx} className="glass-card p-4">
            {!token ? (
              <div className="text-sm text-gray-500">No data available yet.</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold">{token.market?.symbol || "TOKEN"}</div>
                    <div className="text-xs text-gray-500 mono">{(idx === 0 ? leftAddress : rightAddress).slice(0, 6)}...{(idx === 0 ? leftAddress : rightAddress).slice(-4)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Sentinel Score</div>
                    <div className="text-2xl font-bold">{idx === 0 ? leftScore : rightScore}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm text-gray-300">
                  Grade: <span className="font-semibold">{token.analysis?.grade || "-"}</span> · Confidence:{" "}
                  <span className="font-semibold">{safeNum(token.analysis?.confidence)}%</span>
                </div>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="glass-card p-5">
        <h2 className="text-lg font-semibold mb-3">Differential metrics</h2>
        {!leftToken || !rightToken ? (
          <div className="text-sm text-gray-500">Load both tokens to see side-by-side metrics.</div>
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-2 mb-1 border-b soft-divider text-xs uppercase tracking-wide text-gray-500">
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
              formatter={(v) => `$${v.toLocaleString()}`}
            />
            <MetricRow
              label="24h volume"
              left={safeNum(leftToken.market?.volume24h)}
              right={safeNum(rightToken.market?.volume24h)}
              formatter={(v) => `$${v.toLocaleString()}`}
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
              Prefer <strong>{winner === "left" ? leftToken.market?.symbol : rightToken.market?.symbol}</strong> for entry setup.
            </div>
            <div className="text-sm text-gray-300 inline-flex items-center gap-2">
              <TrendingUp size={14} />
              Keep the weaker setup in watchlist and wait for confirmation before sizing.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

