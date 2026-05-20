import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { useLocale } from "../contexts/LocaleContext";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";
import {
  InstitutionalPage,
  InstitutionalSection,
  InstitutionalCard
} from "../components/institutional";

function readLocalWatchlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem("sentinel-watchlist-cache") || "[]");
    return Array.isArray(parsed) ? parsed.map((a) => ({ token_address: a, note: "", added_at: null })) : [];
  } catch {
    return [];
  }
}

function shortMint(value) {
  const s = String(value || "");
  if (s.length <= 14) return s || "—";
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function WatchlistMetric({ label, value, sub, tone = "default" }) {
  const toneClass =
    tone === "accent"
      ? "border-yellow-400/25 bg-yellow-500/[0.06] text-yellow-100"
      : tone === "live"
        ? "border-emerald-400/25 bg-emerald-500/[0.06] text-emerald-100"
        : "border-white/10 bg-white/[0.025] text-sl-text";
  return (
    <div className={`border px-4 py-3 ${toneClass}`}>
      <p className="text-[9px] font-mono font-semibold uppercase tracking-[0.2em] text-sl-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-current">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-sl-muted">{sub}</p> : null}
    </div>
  );
}

function EmptyWatchlistState() {
  const workflow = [
    ["01", "Scan", "Paste a mint or wallet and open the intelligence sheet."],
    ["02", "Track", "Add selected assets to your watchlist for ongoing review."],
    ["03", "Review", "Return from Alerts, Smart Money, or Portfolio with context intact."]
  ];

  return (
    <div className="relative overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_42%),rgba(9,10,18,0.94)] px-5 py-8 sm:px-7 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/50 to-transparent" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-center">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 border border-yellow-400/20 bg-yellow-500/[0.08] px-2.5 py-1 text-[9px] font-mono font-semibold uppercase tracking-[0.2em] text-yellow-100">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.65)]" />
            Watchlist empty
          </div>
          <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight text-sl-text sm:text-3xl">
            Build a monitored book of Solana assets with a cleaner review surface.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-sl-sub">
            Sentinel keeps this page focused on tokens you intentionally track. Start from Scanner, validate the mint, then return here with a structured command-center view for follow-up research.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href="/scanner" className="btn-primary no-underline">
              OPEN SCANNER
            </Link>
            <Link href="/" className="btn-ghost-sm no-underline">
              VIEW LIVE FEED
            </Link>
          </div>
        </div>

        <div className="grid gap-2">
          {workflow.map(([step, title, body]) => (
            <div key={step} className="border border-white/10 bg-black/20 px-3.5 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] font-mono text-[10px] text-yellow-100">
                  {step}
                </span>
                <div>
                  <p className="text-sm font-semibold text-sl-text">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-sl-muted">{body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const { t } = useLocale();
  const token = useClientAuthToken();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!token) {
        if (!alive) return;
        setRows(readLocalWatchlist());
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${getPublicApiUrl()}/api/v1/watchlist`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || "watchlist_failed");
        setRows(Array.isArray(json.data) ? json.data : []);
      } catch (e) {
        if (!alive) return;
        setError(e.message || "watchlist_failed");
        setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [token]);

  const list = useMemo(() => rows.slice(0, 80), [rows]);
  const metrics = useMemo(() => {
    const dated = list.filter((row) => row.added_at).length;
    return {
      tracked: list.length,
      source: token ? "Account" : "Local",
      dated,
      visible: Math.min(list.length, 80)
    };
  }, [list, token]);

  return (
    <InstitutionalPage
      trackerLabel="WATCHLIST · COMMAND CENTER"
      title="Tracked Asset Book"
      subtitle={token ? t("watchlist.subLive") : t("watchlist.subLocal")}
      pageHeadTitle={t("watchlist.pageTitle")}
      pageHeadDescription={t("watchlist.pageDesc")}
      width="wide"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/scanner" className="btn-primary no-underline">
            OPEN SCANNER
          </Link>
          <button type="button" className="btn-ghost-sm">
            EXPORT
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <WatchlistMetric label="Tracked" value={metrics.tracked} sub="Tokens under observation" tone="accent" />
        <WatchlistMetric label="Source" value={metrics.source} sub={token ? "Synced account view" : "Browser fallback"} tone="live" />
        <WatchlistMetric label="Dated" value={metrics.dated} sub="Rows with add timestamp" />
        <WatchlistMetric label="Visible" value={metrics.visible} sub="Current page sample" />
      </div>

      <InstitutionalSection
        trackerLabel="01 · Watchlist intelligence"
        title="Tokens under observation"
        description="A focused book for assets you want to monitor from scanner discovery through desk review, alerts and portfolio follow-up."
        actions={
          <div className="hidden items-center gap-2 sm:flex">
            <span className="border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-mono text-sl-muted">
              {loading ? "SYNCING" : error ? "DEGRADED" : "READY"}
            </span>
          </div>
        }
      >
        <InstitutionalCard padded={false} tone={list.length ? "default" : "accent"}>
          {loading ? (
            <div className="px-5 py-8">
              <div className="h-2 w-28 animate-pulse bg-white/10" />
              <p className="mt-4 text-sm text-sl-sub">{t("watchlist.loading")}</p>
            </div>
          ) : null}

          {!loading && error ? (
            <div className="border border-red-500/25 bg-red-500/[0.06] px-5 py-5">
              <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-red-200">
                Watchlist degraded
              </p>
              <p className="mt-2 text-sm text-red-100">{t("watchlist.error", { err: error })}</p>
            </div>
          ) : null}

          {!loading && !error && !list.length ? <EmptyWatchlistState /> : null}

          {!loading && !error && list.length ? (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[860px]">
                <thead>
                  <tr>
                    <th className="data-th">TOKEN</th>
                    <th className="data-th">STATUS</th>
                    <th className="data-th">PRICE</th>
                    <th className="data-th">24H</th>
                    <th className="data-th">WATCH SCORE</th>
                    <th className="data-th">ADDED</th>
                    <th className="data-th">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row, idx) => {
                    const mint = row.token_address;
                    return (
                      <tr key={mint || idx} className="group border-t border-white/[0.04] hover:bg-white/[0.025]">
                        <td className="data-td">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-cyan-400/20 bg-cyan-500/[0.06] text-[10px] font-bold text-cyan-100">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-semibold text-cyan-100">{shortMint(mint)}</p>
                              {row.note ? <p className="mt-0.5 truncate text-[10px] text-sl-muted">{row.note}</p> : null}
                            </div>
                          </div>
                        </td>
                        <td className="data-td">
                          <span className="inline-flex items-center gap-1 border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Tracking
                          </span>
                        </td>
                        <td className="data-td">—</td>
                        <td className="data-td data-neutral">—</td>
                        <td className="data-td">
                          <div className="flex items-center gap-2">
                            <div className="score-track w-24">
                              <div className="score-fill-mid" style={{ width: "40%" }} />
                            </div>
                            <span className="font-mono text-[10px] text-sl-muted">watch</span>
                          </div>
                        </td>
                        <td className="data-td">{formatDate(row.added_at)}</td>
                        <td className="data-td">
                          <div className="flex items-center gap-2">
                            <TerminalActionIcons mint={mint} />
                            <Link href={`/token/${mint}`} className="btn-ghost-sm no-underline">
                              {t("watchlist.open")}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </InstitutionalCard>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
