import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHead } from "../components/seo/PageHead";
import { ProPurchaseButton } from "../components/subscription/ProPurchaseButton";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";

const WIN_DEFINITION = "outcome_pct >= 1% at resolve horizon";

function fmtPctPoints(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  if (Math.abs(n) >= 1000) return `${sign}${Math.round(n).toLocaleString()}%`;
  if (Math.abs(n) >= 100) return `${sign}${n.toFixed(0)}%`;
  return `${sign}${n.toFixed(1)}%`;
}

function fmtNum(v, digits = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function shortMint(v) {
  const s = String(v || "");
  if (!s) return "—";
  if (s.length <= 14) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function signalBadge(type) {
  const label = String(type || "signal").replace(/_/g, " ");
  return (
    <span className="sl-pill border border-[var(--sl-sapphire-mid)]/40 bg-[var(--sl-sapphire-mid)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--sl-sapphire-hi)]">
      {label}
    </span>
  );
}

function HeroKpi({ label, value, sub, tone = "default" }) {
  const toneClass =
    tone === "good"
      ? "sl-card-premium sl-shine-edge border-emerald-500/20"
      : tone === "accent"
        ? "sl-card-premium sl-shine-edge border-[var(--sl-sapphire-mid)]/30"
        : "sl-card-premium sl-shine-edge";
  return (
    <div className={`${toneClass} px-5 py-4`}>
      <p className="sl-eyebrow text-[var(--sl-text-muted)]">{label}</p>
      <p className={`sl-num mt-2 text-3xl font-semibold tracking-tight ${tone === "good" ? "text-emerald-300" : "text-[var(--sl-diamond-bright)]"}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-[var(--sl-text-muted)]">{sub}</p> : null}
    </div>
  );
}

function StatRow({ label, value, hint }) {
  return (
    <tr className="border-b border-[var(--sl-border)]/60">
      <td className="py-2.5 pr-4 text-sm text-[var(--sl-text-secondary)]">
        {label}
        {hint ? (
          <span className="ml-1 cursor-help text-[var(--sl-text-muted)]" title={hint}>
            ⓘ
          </span>
        ) : null}
      </td>
      <td className="py-2.5 text-right font-mono text-sm tabular-nums text-[var(--sl-text-primary)]">{value}</td>
    </tr>
  );
}

export default function ResultsPage() {
  const { t } = useLocale();
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const base = getPublicApiUrl();
    try {
      const [sumRes, hiRes] = await Promise.all([
        fetch(`${base}/api/v1/public/track-record/summary?days=${days}`),
        fetch(`${base}/api/v1/public/highlights?days=${days}&limit=20&minOutcomePct=50`)
      ]);
      const sumJson = await sumRes.json().catch(() => ({}));
      const hiJson = await hiRes.json().catch(() => ({}));
      if (!sumRes.ok || sumJson?.ok === false) throw new Error(sumJson.error || "summary_failed");
      if (!hiRes.ok || hiJson?.ok === false) throw new Error(hiJson.error || "highlights_failed");
      setSummary(sumJson);
      setHighlights(Array.isArray(hiJson.items) ? hiJson.items : []);
    } catch (e) {
      setError(e.message || "load_failed");
      setSummary(null);
      setHighlights([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const windowLabel = useMemo(() => `${days}d`, [days]);

  return (
    <>
      <PageHead title={t("results.pageTitle")} description={t("results.pageDesc")} />
      <div className="sl-container py-8 sm:py-10 pb-28 space-y-8">
        <header className="sl-card-premium sl-shine-edge relative overflow-hidden px-6 py-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--sl-sapphire-hi)]/50 to-transparent" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="sl-eyebrow text-[var(--sl-sapphire-hi)]">PROOF · REAL OUTCOMES</span>
              <h1 className="sl-display mt-2 text-2xl sm:text-3xl text-[var(--sl-text-primary)]">Sentinel results</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--sl-text-muted)]">
                Verified resolved signals from our performance ledger. Win rate uses a single honest rule:{" "}
                <span className="font-mono text-[var(--sl-text-secondary)]">{WIN_DEFINITION}</span>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={days === d ? "sl-btn-primary text-xs px-3 py-1.5" : "btn-pill text-xs"}
                >
                  {d}d
                </button>
              ))}
              <button type="button" onClick={load} className="btn-ghost-sm">
                REFRESH
              </button>
              <Link href="/track-record" className="btn-outline no-underline">
                FULL TRACK RECORD
              </Link>
            </div>
          </div>
        </header>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {loading ? <p className="text-sm text-[var(--sl-text-muted)]">{t("results.loading")}</p> : null}

        {!loading && summary ? (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <HeroKpi
                label="Win rate"
                value={`${fmtNum(summary.win_rate_pct, 1)}%`}
                sub={summary.win_definition || WIN_DEFINITION}
                tone="good"
              />
              <HeroKpi
                label="Best trade"
                value={fmtPctPoints(summary.best_trade_pct)}
                sub={`Peak resolved outcome · ${windowLabel}`}
                tone="accent"
              />
              <HeroKpi
                label="Trades ≥ +100%"
                value={Number(summary.trades_above_100pct || 0).toLocaleString()}
                sub="Resolved in window"
              />
              <HeroKpi
                label="Total resolved"
                value={Number(summary.total_resolved || 0).toLocaleString()}
                sub={`${Number(summary.wins || 0).toLocaleString()} wins · ${Number(summary.losses || 0).toLocaleString()} losses`}
              />
            </section>

            <section>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="sl-display text-xl text-[var(--sl-text-primary)]">Best calls</h2>
                  <p className="mt-1 text-sm text-[var(--sl-text-muted)]">
                    Top token per mint — best resolved outcome ≥ +50% in the last {windowLabel}.
                  </p>
                </div>
                <span className="font-mono text-xs text-[var(--sl-text-muted)]">{highlights.length} tokens</span>
              </div>
              {highlights.length === 0 ? (
                <p className="text-sm text-[var(--sl-text-muted)]">No highlights in this window yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {highlights.map((item) => {
                    const sym = item.token_symbol || shortMint(item.token_address);
                    return (
                      <Link
                        key={item.token_address}
                        href={`/token/${item.token_address}`}
                        className="sl-card-premium sl-ring-hover block p-4 no-underline transition hover:border-[var(--sl-sapphire-mid)]/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-semibold tracking-tight text-[var(--sl-text-primary)]">{sym}</p>
                            <p className="font-mono text-[10px] text-[var(--sl-text-muted)]">{shortMint(item.token_address)}</p>
                          </div>
                          <p className="font-mono text-xl font-bold tabular-nums text-emerald-300">{fmtPctPoints(item.outcome_pct)}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {signalBadge(item.signal_type)}
                          {item.confidence != null ? (
                            <span className="text-[10px] font-mono text-[var(--sl-text-muted)]">
                              conf {Math.round(Number(item.confidence))}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[11px] text-[var(--sl-text-muted)]">
                          Emitted {item.emitted_at ? new Date(item.emitted_at).toLocaleString() : "—"}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="sl-card-premium sl-shine-edge p-5">
              <h2 className="sl-display text-xl text-[var(--sl-text-primary)]">Honest stats</h2>
              <p className="mt-1 text-sm text-[var(--sl-text-muted)]">
                Full methodology disclosure — including average loser return for credibility.
              </p>
              <table className="mt-4 w-full max-w-xl">
                <tbody>
                  <StatRow label="Window" value={windowLabel} />
                  <StatRow label="Win rate" value={`${fmtNum(summary.win_rate_pct, 1)}%`} hint={WIN_DEFINITION} />
                  <StatRow label="Wins (≥ +1%)" value={Number(summary.wins || 0).toLocaleString()} />
                  <StatRow label="Losses (&lt; +1%)" value={Number(summary.losses || 0).toLocaleString()} />
                  <StatRow label="Avg outcome (all)" value={fmtPctPoints(summary.avg_outcome_pct)} />
                  <StatRow label="Avg winner" value={fmtPctPoints(summary.avg_winner_pct)} />
                  <StatRow label="Avg loser" value={fmtPctPoints(summary.avg_loser_pct)} />
                  <StatRow label="Best trade" value={fmtPctPoints(summary.best_trade_pct)} />
                  <StatRow label="Trades ≥ +100%" value={Number(summary.trades_above_100pct || 0).toLocaleString()} />
                  <StatRow label="Trades ≥ +500%" value={Number(summary.trades_above_500pct || 0).toLocaleString()} />
                  <StatRow label="Profit factor" value={fmtNum(summary.profit_factor, 2)} hint="Sum of winner % ÷ |sum of loser %|" />
                </tbody>
              </table>
            </section>
          </>
        ) : null}

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--sl-border)] bg-[var(--sl-bg-base)]/95 backdrop-blur-md py-3 px-4 safe-bottom-pad">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
            <span className="text-[var(--sl-text-muted)] text-center sm:text-left">{t("results.stickyLine")}</span>
            <ProPurchaseButton className="sl-btn-primary inline-flex text-center no-underline">
              {t("results.upgradePro")}
            </ProPurchaseButton>
          </div>
        </div>
      </div>
    </>
  );
}
