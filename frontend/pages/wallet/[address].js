import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PageHead } from "../../components/seo/PageHead";
import { WalletNarrativeCard } from "../../components/WalletNarrativeCard";
import { fetchWalletSummary } from "../../lib/api/walletSummary";
import { fetchWalletBehaviorSummary, fetchWalletBehaviorTokens } from "../../lib/api/walletBehavior";
import { formatDateTime, formatInteger, formatUsdAmount, formatUsdWhole } from "../../lib/formatStable";
import { useT } from "../../lib/i18n";

function normalizeAddress(query) {
  const raw = query?.address;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return "";
}

function normalizeLang(query) {
  const lang = String(query?.lang || "es").toLowerCase();
  return lang === "en" ? "en" : "es";
}

export async function getServerSideProps() {
  return { props: {} };
}

export default function WalletDetailPage() {
  const router = useRouter();
  const address = normalizeAddress(router.query);
  const lang = normalizeLang(router.query);
  const tr = useT(lang);

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
        <div className="glass-card sl-inset inline-flex items-center gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          {tr("wallet.page.loadingWallet")}
        </div>
      </div>
    );
  }

  if (!address || address.length < 32) {
    return (
      <div className="sl-container py-10">
        <div className="glass-card sl-inset text-red-300">{tr("wallet.page.invalidAddress")}</div>
      </div>
    );
  }

  const row = summary.data?.data || null;
  const behaviorRow = behavior.data?.data || null;
  const behaviorTokenRows = Array.isArray(behaviorTokens.data?.data) ? behaviorTokens.data.data : [];
  const otherLang = lang === "es" ? "en" : "es";
  const switchLabel = lang === "es" ? "English" : "Español";

  return (
    <>
      <PageHead
        title={`Wallet ${address.slice(0, 4)}...${address.slice(-4)} — Sentinel Ledger`}
        description="Wallet narrative and smart-money performance profile on Sentinel Ledger."
      />
      <div className="sl-container py-8 space-y-5">
        <section className="glass-card sl-inset">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="sl-label">{tr("wallet.page.profileLabel")}</p>
              <h1 className="text-xl text-white font-semibold mt-1">
                {address.slice(0, 4)}...{address.slice(-4)}
              </h1>
              <p className="mono text-[11px] text-gray-500 mt-1 break-all">{address}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/smart-money" className="text-xs px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10">
                {tr("wallet.page.backToSmartMoney")}
              </Link>
              <Link
                href={`/wallet/${address}?lang=${otherLang}`}
                className="text-xs px-3 py-2 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
              >
                {switchLabel}
              </Link>
            </div>
          </div>

          {summary.isLoading ? (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              {tr("wallet.summary.loading")}
            </div>
          ) : null}

          {summary.isError ? (
            <p className="mt-4 text-sm text-red-300">
              {summary.error?.message === "wallet_not_found"
                ? tr("wallet.summary.notFound")
                : tr("wallet.summary.loadError", { error: summary.error?.message || "error" })}
            </p>
          ) : null}

          {row ? (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-gray-500 text-xs">{tr("wallet.summary.winRate")}</p>
                <p className="text-emerald-300 font-semibold">{Number(row.winRate || 0).toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-gray-500 text-xs">{tr("wallet.summary.pnl30d")}</p>
                <p className="text-emerald-300 font-semibold">+${formatUsdWhole(row.pnl30d || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-gray-500 text-xs">{tr("wallet.summary.trades")}</p>
                <p className="text-white font-semibold">{row.totalTrades ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-gray-500 text-xs">{tr("wallet.summary.bestTrade")}</p>
                <p className="text-emerald-300 font-semibold">
                  {row.bestTradePct != null ? `+${Number(row.bestTradePct).toFixed(1)}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 col-span-2 md:col-span-4">
                <p className="text-gray-500 text-xs">{tr("wallet.summary.lastSeen")}</p>
                <p className="text-gray-200">{row.lastSeen ? formatDateTime(row.lastSeen) : "—"}</p>
              </div>
            </div>
          ) : null}
        </section>

        <section id="behavior-memory" className="glass-card sl-inset space-y-3">
          <p className="sl-label">Wallet behavior memory (F5)</p>
          {behavior.isLoading ? (
            <div className="inline-flex items-center gap-2 text-sm text-gray-400">
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
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-gray-500 text-xs">Win rate real</p>
                  <p className="text-emerald-300 font-semibold">{Number(behaviorRow.win_rate_real || 0).toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-gray-500 text-xs">Resolved</p>
                  <p className="text-white font-semibold">{formatInteger(behaviorRow.resolved_signals || 0)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-gray-500 text-xs">Avg pre-pump size</p>
                  <p className="text-cyan-200 font-semibold">${formatUsdAmount(behaviorRow.avg_size_pre_pump_usd || 0)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-gray-500 text-xs">Style</p>
                  <p className="text-violet-200 font-semibold">{behaviorRow.style_label || "—"}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-gray-500 text-xs">Latency post-deploy</p>
                  <p className="text-white font-semibold">
                    {behaviorRow.avg_latency_post_deploy_min != null
                      ? `${Number(behaviorRow.avg_latency_post_deploy_min).toFixed(1)} min`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-gray-500 text-xs">Solo / Group</p>
                  <p className="text-white font-semibold">
                    {(Number(behaviorRow.solo_buy_ratio || 0) * 100).toFixed(0)}% /{" "}
                    {(Number(behaviorRow.group_buy_ratio || 0) * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-gray-500 text-xs">Anticipatory</p>
                  <p className="text-emerald-200 font-semibold">
                    {(Number(behaviorRow.anticipatory_buy_ratio || 0) * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-gray-500 text-xs">Breakout</p>
                  <p className="text-amber-200 font-semibold">
                    {(Number(behaviorRow.breakout_buy_ratio || 0) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                Computed {behaviorRow.computed_at ? formatDateTime(behaviorRow.computed_at) : "—"} · lookback{" "}
                {formatInteger(behaviorRow.lookback_days || 0)}d
              </p>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs text-gray-400 mb-2">Top wallet-token footprints</p>
                {!behaviorTokenRows.length ? (
                  <p className="text-xs text-gray-500">No token features yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {behaviorTokenRows.slice(0, 10).map((row2) => (
                      <div
                        key={`${row2.token_address}-${row2.computed_at}-${row2.buys_count}`}
                        className="text-xs text-gray-300 rounded border border-white/10 bg-black/20 px-2 py-1.5"
                      >
                        <p className="font-mono break-all text-cyan-200">{row2.token_address}</p>
                        <p className="text-gray-400 mt-0.5">
                          buys {formatInteger(row2.buys_count || 0)} · avg ${formatUsdAmount(row2.avg_amount_usd || 0)} ·
                          WR {Number(row2.win_rate_real || 0).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>

        <section className="glass-card sl-inset">
          <p className="sl-label mb-3">{tr("wallet.page.whyThisWallet")}</p>
          <WalletNarrativeCard walletAddress={address} lang={lang} />
        </section>
      </div>
    </>
  );
}
