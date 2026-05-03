import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { buildSolscanAccountUrl, EXTERNAL_ANCHOR_REL } from "../../lib/terminalLinks";
import { PageHead } from "../../components/seo/PageHead";
import { WalletNarrativeCard } from "../../components/WalletNarrativeCard";
import { fetchWalletSummary } from "../../lib/api/walletSummary";
import { fetchWalletBehaviorSummary, fetchWalletBehaviorTokens } from "../../lib/api/walletBehavior";
import { formatDateTime, formatInteger, formatUsdAmount, formatUsdWhole } from "../../lib/formatStable";
import {
  BEHAVIOR_LEGEND_EN,
  BEHAVIOR_LEGEND_ES,
  formatLatencyPostDeployMin,
  formatPrePumpUsd
} from "../../lib/walletBehaviorDisplay";
import { useLocale } from "../../contexts/LocaleContext";
import { resolveWalletNarrativeLang, walletNarrativeApiLang } from "../../lib/walletNarrativeLang";

function normalizeAddress(query) {
  const raw = query?.address;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return "";
}

export async function getServerSideProps() {
  return { props: {} };
}

function behaviorWinTone(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return "text-sl-text font-semibold";
  if (n >= 50) return "text-emerald-300 font-semibold";
  return "text-rose-400 font-semibold";
}

const STYLE_READABLE = {
  solo_operator: "Solo operator",
  cluster_trader: "Cluster trader",
  anticipatory_sniper: "Anticipatory sniper",
  breakout_follower: "Breakout follower",
  balanced_operator: "Balanced operator",
  insufficient_sample: "Insufficient sample"
};

export default function WalletDetailPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const address = normalizeAddress(router.query);
  const narrativeLang = router.isReady
    ? resolveWalletNarrativeLang(router.query, locale)
    : walletNarrativeApiLang(locale);

  const summary = useQuery({
    queryKey: ["wallet-summary", address],
    queryFn: () => fetchWalletSummary(address),
    enabled: Boolean(address)
  });
  const behavior = useQuery({
    queryKey: ["wallet-behavior-summary", address],
    queryFn: () => fetchWalletBehaviorSummary(address),
    enabled: Boolean(address),
    staleTime: 10 * 60 * 1000
  });
  const behaviorTokens = useQuery({
    queryKey: ["wallet-behavior-tokens", address],
    queryFn: () => fetchWalletBehaviorTokens(address, 12),
    enabled: Boolean(address),
    staleTime: 10 * 60 * 1000
  });

  if (!router.isReady) {
    return (
      <div className="sl-container py-10">
        <div className="glass-card sl-inset inline-flex items-center gap-2 text-sl-sub">
          <Loader2 size={16} className="animate-spin" />
          {t("wallet.page.loadingWallet")}
        </div>
      </div>
    );
  }

  if (!address || address.length < 32) {
    return (
      <div className="sl-container py-10">
        <div className="glass-card sl-inset text-red-300">{t("wallet.page.invalidAddress")}</div>
      </div>
    );
  }

  const row = summary.data?.data || null;
  const behaviorRow = behavior.data?.data || null;
  const behaviorTokenRows = Array.isArray(behaviorTokens.data?.data) ? behaviorTokens.data.data : [];
  const otherNarrative = narrativeLang === "es" ? "en" : "es";
  const walletStyle = behaviorRow?.style_label || row?.styleLabel || "—";

  return (
    <>
      <PageHead
        title={`Wallet ${address.slice(0, 4)}...${address.slice(-4)} — Sentinel Ledger`}
        description="Wallet narrative and smart-money performance profile on Sentinel Ledger."
      />
      <div className="sl-container py-8 space-y-5">
        <section className="terminal-panel px-6 py-4 mb-4">
          <span className="section-title">WALLET INTELLIGENCE</span>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-sl-card border border-sl-border flex items-center justify-center flex-shrink-0 rounded-[2px]">
                <span className="font-mono text-xs text-sl-violet">W</span>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-sl-text">
                    {address.slice(0, 8)}...{address.slice(-8)}
                  </span>
                  <button type="button" className="btn-ghost-sm" onClick={() => navigator.clipboard?.writeText(address)}>
                    COPY
                  </button>
                  <a href={buildSolscanAccountUrl(address)} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="btn-ghost-sm no-underline">
                    SOLSCAN
                  </a>
                </div>
                <p className="font-mono text-[11px] text-sl-muted mt-1 break-all">{address}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/smart-money" className="btn-ghost-sm">
                {t("wallet.page.backToSmartMoney")}
              </Link>
              <Link href={`/wallet/${address}?lang=${otherNarrative}`} className="btn-ghost-sm">
                {t(otherNarrative === "en" ? "wallet.page.switchNarrativeToEn" : "wallet.page.switchNarrativeToEs")}
              </Link>
            </div>
          </div>

          {summary.isLoading ? (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-sl-sub">
              <Loader2 size={14} className="animate-spin" />
              {t("wallet.summary.loading")}
            </div>
          ) : null}

          {summary.isError ? (
            <p className="mt-4 text-sm text-red-300">
              {summary.error?.message === "wallet_not_found"
                ? t("wallet.summary.notFound")
                : t("wallet.summary.loadError", { error: summary.error?.message || "error" })}
            </p>
          ) : null}

          {row ? (
            <div className="kpi-strip w-full mb-4 mt-4">
              <div className="kpi-block">
                <span className="kpi-label">WIN RATE</span>
                <span className="kpi-number text-sl-green">{Number(row.winRate || 0).toFixed(1)}%</span>
              </div>
              <div className="kpi-block">
                <span className="kpi-label">TOTAL TRADES</span>
                <span className="kpi-number">{row.totalTrades ?? "—"}</span>
              </div>
              <div className="kpi-block">
                <span className="kpi-label">BEST TRADE</span>
                <span className="kpi-number text-sl-green">
                  {row.bestTradePct != null ? `+${Number(row.bestTradePct).toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="kpi-block">
                <span className="kpi-label">STYLE</span>
                <span className="kpi-number text-sl-violet text-base">{walletStyle}</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="terminal-panel mb-4">
          <WalletNarrativeCard walletAddress={address} lang={narrativeLang} />
        </section>

        <section id="behavior-memory" className="terminal-panel mb-4 space-y-3">
          <div className="panel-header">
            <span className="section-title">TRADE HISTORY</span>
          </div>
          {behavior.isLoading ? (
            <div className="inline-flex items-center gap-2 text-sm text-sl-sub">
              <Loader2 size={14} className="animate-spin" />
              Loading behavior stats...
            </div>
          ) : null}
          {behavior.isError ? (
            <p className="text-xs text-amber-200">
              {String(behavior.error?.message || "").includes("not_found")
                ? "Behavior stats pending first cron run."
                : `Behavior stats unavailable (${behavior.error?.message || "error"}).`}
            </p>
          ) : null}
          {behaviorRow ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Win rate (final)</p>
                  <p className={behaviorWinTone(behaviorRow.win_rate_real)} title="Agg. outcome per signal &gt; 0">
                    {Number(behaviorRow.win_rate_real || 0).toFixed(1)}%
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Win rate (5m only)</p>
                  <p className={behaviorWinTone(behaviorRow.win_rate_real_5m)}>
                    {Number(behaviorRow.win_rate_real_5m || 0).toFixed(1)}%
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Win rate (30m only)</p>
                  <p className={behaviorWinTone(behaviorRow.win_rate_real_30m)}>
                    {Number(behaviorRow.win_rate_real_30m || 0).toFixed(1)}%
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Win rate (2h only)</p>
                  <p className={behaviorWinTone(behaviorRow.win_rate_real_2h)}>
                    {Number(behaviorRow.win_rate_real_2h || 0).toFixed(1)}%
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Resolved</p>
                  <p className="text-sl-text font-semibold">{formatInteger(behaviorRow.resolved_signals || 0)}</p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Resolved (5m/30m/2h)</p>
                  <p className="text-sl-text font-semibold">
                    {formatInteger(behaviorRow.resolved_signals_5m || 0)}/{formatInteger(behaviorRow.resolved_signals_30m || 0)}/
                    {formatInteger(behaviorRow.resolved_signals_2h || 0)}
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Avg pre-pump size</p>
                  <p className="text-cyan-200 font-semibold" title="Solo señales con desenlace ≥ +20%">
                    {formatPrePumpUsd(behaviorRow.avg_size_pre_pump_usd).text}
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Style</p>
                  <p className="text-violet-200 font-semibold">
                    {STYLE_READABLE[behaviorRow.style_label] || behaviorRow.style_label || "—"}
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Latency post-deploy</p>
                  <p className="text-sl-text font-semibold">
                    {(() => {
                      const { text, unreliable } = formatLatencyPostDeployMin(behaviorRow.avg_latency_post_deploy_min);
                      return unreliable ? (
                        <span title="Ancla de pool dudosa o par demasiado antiguo">—</span>
                      ) : (
                        text
                      );
                    })()}
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Solo / Group</p>
                  <p className="text-sl-text font-semibold">
                    {(Number(behaviorRow.solo_buy_ratio || 0) * 100).toFixed(0)}% /{" "}
                    {(Number(behaviorRow.group_buy_ratio || 0) * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Anticipatory</p>
                  <p className="text-emerald-200 font-semibold">
                    {(Number(behaviorRow.anticipatory_buy_ratio || 0) * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="border border-sl-border bg-white/[0.03] px-3 py-2">
                  <p className="text-sl-muted text-xs">Breakout</p>
                  <p className="text-amber-200 font-semibold">
                    {(Number(behaviorRow.breakout_buy_ratio || 0) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-sl-muted leading-snug border-l-2 border-sl-border pl-2">
                {locale === "es" ? BEHAVIOR_LEGEND_ES : BEHAVIOR_LEGEND_EN}
              </p>
              <p className="text-[11px] text-sl-muted">
                Computed {behaviorRow.computed_at ? formatDateTime(behaviorRow.computed_at) : "—"} · lookback{" "}
                {formatInteger(behaviorRow.lookback_days || 0)}d
              </p>
              <div className="border border-sl-border bg-sl-card p-3">
                <p className="text-xs text-sl-sub mb-2">Top wallet-token footprints</p>
                {!behaviorTokenRows.length ? (
                  <p className="text-xs text-sl-muted">No token features yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="data-th">TOKEN</th>
                          <th className="data-th">ACTION</th>
                          <th className="data-th">DATE</th>
                          <th className="data-th">OUTCOME</th>
                        </tr>
                      </thead>
                      <tbody>
                        {behaviorTokenRows.slice(0, 10).map((row2) => {
                          const outcome = Number(row2.win_rate_real || 0);
                          return (
                            <tr key={`${row2.token_address}-${row2.computed_at}-${row2.buys_count}`} className="feed-row">
                              <td className="data-td font-mono break-all text-cyan-200">{row2.token_address}</td>
                              <td className="data-td">buys {formatInteger(row2.buys_count || 0)} · avg ${formatUsdAmount(row2.avg_amount_usd || 0)}</td>
                              <td className="data-td">{row2.computed_at ? formatDateTime(row2.computed_at) : "—"}</td>
                              <td className={`data-td ${outcome >= 50 ? "data-pos" : "data-neg"}`}>{outcome.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
