import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PageHead } from "../../components/seo/PageHead";
import { WalletNarrativeCard } from "../../components/WalletNarrativeCard";
import { fetchWalletSummary } from "../../lib/api/walletSummary";
import { formatDateTime, formatUsdWhole } from "../../lib/formatStable";

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
          Loading wallet...
        </div>
      </div>
    );
  }

  if (!address || address.length < 32) {
    return (
      <div className="sl-container py-10">
        <div className="glass-card sl-inset text-red-300">Invalid wallet address.</div>
      </div>
    );
  }

  const row = summary.data?.data || null;

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
              <p className="sl-label">Wallet profile</p>
              <h1 className="text-xl text-white font-semibold mt-1">
                {address.slice(0, 4)}...{address.slice(-4)}
              </h1>
              <p className="mono text-[11px] text-gray-500 mt-1 break-all">{address}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/smart-money" className="text-xs px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10">
                Back to Smart Money
              </Link>
              <Link
                href={`/wallet/${address}?lang=${lang === "es" ? "en" : "es"}`}
                className="text-xs px-3 py-2 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
              >
                {lang === "es" ? "English" : "Español"}
              </Link>
            </div>
          </div>

          {summary.isLoading ? (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              Loading summary...
            </div>
          ) : null}

          {summary.isError ? (
            <p className="mt-4 text-sm text-red-300">
              {summary.error?.message === "wallet_not_found"
                ? "Wallet not found in smart_wallets yet."
                : `Could not load wallet summary (${summary.error?.message || "error"}).`}
            </p>
          ) : null}

          {row ? (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-gray-500 text-xs">Win rate</p>
                <p className="text-emerald-300 font-semibold">{Number(row.winRate || 0).toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-gray-500 text-xs">30d PnL</p>
                <p className="text-emerald-300 font-semibold">+${formatUsdWhole(row.pnl30d || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-gray-500 text-xs">Trades</p>
                <p className="text-white font-semibold">{row.totalTrades ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-gray-500 text-xs">Best trade</p>
                <p className="text-emerald-300 font-semibold">
                  {row.bestTradePct != null ? `+${Number(row.bestTradePct).toFixed(1)}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 col-span-2 md:col-span-4">
                <p className="text-gray-500 text-xs">Last seen</p>
                <p className="text-gray-200">{row.lastSeen ? formatDateTime(row.lastSeen) : "—"}</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="glass-card sl-inset">
          <p className="sl-label mb-3">Why this wallet?</p>
          <WalletNarrativeCard walletAddress={address} lang={lang} />
        </section>
      </div>
    </>
  );
}

