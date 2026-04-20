import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PageHead } from "../../components/seo/PageHead";
import { WalletNarrativeCard } from "../../components/WalletNarrativeCard";
import { fetchWalletSummary } from "../../lib/api/walletSummary";
import { formatDateTime, formatUsdWhole } from "../../lib/formatStable";
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

        <section className="glass-card sl-inset">
          <p className="sl-label mb-3">{tr("wallet.page.whyThisWallet")}</p>
          <WalletNarrativeCard walletAddress={address} lang={lang} />
        </section>
      </div>
    </>
  );
}
