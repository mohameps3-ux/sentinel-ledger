import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "wins", label: "Wins" },
  { id: "losses", label: "Losses" },
  { id: "pending", label: "Pending" }
];

async function fetchTrackRecord(filter) {
  const qs = new URLSearchParams();
  qs.set("filter", filter || "all");
  qs.set("limit", "120");
  const res = await fetch(`${getPublicApiUrl()}/api/v1/public/track-record?${qs.toString()}`);
  if (!res.ok) throw new Error("track_record_fetch_failed");
  return res.json();
}

function pct(v, unit = true) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const value = unit ? n * 100 : n;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function int(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function time(raw) {
  const t = raw ? new Date(raw) : null;
  if (!t || Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function rowTone(result) {
  if (result === "WIN") return "border-emerald-500/20 bg-emerald-500/[0.055]";
  if (result === "LOSS") return "border-red-500/20 bg-red-500/[0.045]";
  return "border-white/[0.08] bg-white/[0.025]";
}

function ruleTone(winRate) {
  const n = Number(winRate);
  if (!Number.isFinite(n)) return "border-white/[0.08]";
  if (n > 0.65) return "border-emerald-500/25 bg-emerald-500/[0.04]";
  if (n >= 0.45) return "border-amber-500/25 bg-amber-500/[0.04]";
  return "border-red-500/25 bg-red-500/[0.04]";
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-5 text-sm text-gray-400">
      {children}
    </div>
  );
}

export default function VerifiedTrackRecordPage() {
  const { t } = useLocale();
  const [filter, setFilter] = useState("all");

  const query = useQuery({
    queryKey: ["verified-track-record", filter],
    queryFn: () => fetchTrackRecord(filter),
    refetchInterval: 60000
  });

  const data = query.data || {};
  const rows = useMemo(() => data.rows || [], [data.rows]);
  const rules = useMemo(() => data.rules || [], [data.rules]);
  const bestCalls = useMemo(() => data.bestCalls || [], [data.bestCalls]);
  const worstCalls = useMemo(() => data.worstCalls || [], [data.worstCalls]);
  const stats = data.stats || {};
  const summary = data.summary || null;
  const hasData = Boolean(data.meta?.hasOracleData);

  return (
    <>
      <PageHead title="Verified Track Record — Sentinel Ledger" description="Every signal, every outcome, nothing hidden." />
      <div className="sl-container py-8 space-y-6">
        <section className="glass-card sl-inset border-violet-500/20 bg-violet-500/[0.025]">
          <p className="sl-label">{t("terminal.lexicon.verifiedTrackRecord")}</p>
          <h1 className="text-3xl font-semibold text-white mt-1">Sentinel Verified Track Record</h1>
          <p className="text-sm text-gray-400 mt-2 max-w-3xl leading-relaxed">
            Every signal. Every outcome. Nothing hidden.
          </p>
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Total signals" value={hasData ? int(stats.totalSignals) : "Accumulating"} />
            <Stat label="Win rate" value={stats.winRate != null ? pct(stats.winRate) : "Accumulating"} />
            <Stat label="Avg return" value={stats.avgReturn != null ? pct(stats.avgReturn) : "Accumulating"} />
            <Stat label="Best call" value={stats.bestCall ? pct(stats.bestCall.outcome60m) : "Accumulating"} hint={stats.bestCall?.symbol || stats.bestCall?.token} />
            <Stat label="Worst call" value={stats.worstCall ? pct(stats.worstCall.outcome60m) : "Accumulating"} hint={stats.worstCall?.symbol || stats.worstCall?.token} />
          </div>
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          {summary ? (
            <>
              <Stat label="Win rate 60m" value={pct(summary.winRate60m)} hint={`n=${int(summary.sampleSize)}`} />
              <Stat label="Avg return on wins" value={pct(summary.avgReturnOnWins)} />
              <Stat label="Max drawdown" value={pct(-Math.abs(Number(summary.maxDrawdown || 0)))} />
            </>
          ) : (
            <div className="lg:col-span-3">
              <EmptyState>Building track record — check back in 2 days. Oracle metrics only unlock after n ≥ 10 validated signals.</EmptyState>
            </div>
          )}
        </section>

        <section className="glass-card sl-inset border-white/[0.08] bg-[#080a0d]/90">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="sl-label">Rule Performance</p>
              <h2 className="text-xl font-semibold text-white">Rules ranked by verified confidence</h2>
            </div>
          </div>
          {!rules.length ? (
            <EmptyState>Oracle is validating signals — first results in 24-48h.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left py-2 pr-3">Rule</th>
                    <th className="text-right py-2 px-3">Signals</th>
                    <th className="text-right py-2 px-3">Win Rate</th>
                    <th className="text-right py-2 px-3">Avg Return</th>
                    <th className="text-left py-2 px-3">Regime</th>
                    <th className="text-right py-2 pl-3">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.rule} className={`border-b ${ruleTone(r.winRate)} border-white/[0.06]`}>
                      <td className="py-3 pr-3 font-mono text-cyan-200">{r.rule}</td>
                      <td className="py-3 px-3 text-right font-mono text-gray-200">{int(r.signals)}</td>
                      <td className="py-3 px-3 text-right font-mono text-gray-200">{r.winRate != null ? pct(r.winRate) : "—"}</td>
                      <td className="py-3 px-3 text-right font-mono text-gray-200">{r.avgReturn != null ? pct(r.avgReturn) : "—"}</td>
                      <td className="py-3 px-3 text-gray-400">{r.regime || "—"}</td>
                      <td className="py-3 pl-3 text-right font-mono text-gray-200">{pct(r.confidence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="glass-card sl-inset border-white/[0.08] bg-[#080a0d]/90">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <p className="sl-label">Signal History</p>
              <h2 className="text-xl font-semibold text-white">Chronological validation ledger</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`h-9 px-3 rounded-lg border text-xs font-semibold transition ${
                    filter === f.id
                      ? "border-violet-500/40 bg-violet-500/15 text-violet-100"
                      : "border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {!rows.length ? (
            <EmptyState>{hasData ? "No signals match this filter." : "Oracle is validating signals — first results in 24-48h."}</EmptyState>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className={`rounded-xl border px-3 py-3 ${rowTone(r.result)}`}>
                  <div className="grid lg:grid-cols-[1.1fr_1.2fr_0.8fr_0.9fr_0.7fr_0.7fr_0.7fr_0.7fr] gap-2 items-center text-xs">
                    <span className="text-gray-500">{time(r.timestamp)}</span>
                    <Link href={`/token/${encodeURIComponent(r.token || "")}`} className="font-mono text-cyan-200 no-underline break-all">
                      {r.symbol || r.token || "—"}
                    </Link>
                    <span className="font-mono text-gray-300">{Number(r.signalStrength || 0).toFixed(2)}</span>
                    <span className="text-gray-200">{r.suggestedAction || "—"}</span>
                    <span className="font-mono text-gray-300">{r.outcome5m != null ? pct(r.outcome5m) : "Validating..."}</span>
                    <span className="font-mono text-gray-300">{r.outcome15m != null ? pct(r.outcome15m) : "Validating..."}</span>
                    <span className="font-mono text-gray-300">{r.outcome60m != null ? pct(r.outcome60m) : "Validating..."}</span>
                    <span className="font-semibold text-gray-100">{r.result === "PENDING" ? "Validating..." : r.result}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid lg:grid-cols-2 gap-4">
          <section className="glass-card sl-inset border-emerald-500/20 bg-emerald-500/[0.025]">
            <p className="sl-label">Best Calls</p>
            <h2 className="text-xl font-semibold text-white">This is what Sentinel caught before the market moved</h2>
            {!bestCalls.length ? (
              <p className="text-sm text-gray-500 mt-4">Accumulating verified wins.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {bestCalls.map((r) => (
                  <Link key={r.id} href={`/token/${encodeURIComponent(r.token || "")}`} className="block rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 no-underline">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-mono text-cyan-200 break-all">{r.symbol || r.token}</span>
                      <span className="font-mono text-emerald-300">{pct(r.outcome60m)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{time(r.timestamp)} · predicted {r.suggestedAction}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section className="glass-card sl-inset border-red-500/20 bg-red-500/[0.02]">
            <p className="sl-label">Worst Calls</p>
            <h2 className="text-xl font-semibold text-white">We show our mistakes. That's what makes us different.</h2>
            {!worstCalls.length ? (
              <p className="text-sm text-gray-500 mt-4">No resolved losses yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {worstCalls.map((r) => (
                  <Link key={r.id} href={`/token/${encodeURIComponent(r.token || "")}`} className="block rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 no-underline">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-mono text-cyan-200 break-all">{r.symbol || r.token}</span>
                      <span className="font-mono text-red-300">{pct(r.outcome60m)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{time(r.timestamp)} · predicted {r.suggestedAction}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="glass-card sl-inset border-white/[0.08] bg-white/[0.02]">
          <p className="sl-label">Methodology</p>
          <div className="mt-2 grid md:grid-cols-3 gap-3 text-sm text-gray-400 leading-relaxed">
            <p>Signals are validated at 5, 15, and 60 minutes after emission.</p>
            <p>Win = price increased &gt;5% within 60 minutes.</p>
            <p>All data is on-chain verifiable and sourced from the Validation Oracle tables.</p>
          </div>
        </section>
      </div>
    </>
  );
}
