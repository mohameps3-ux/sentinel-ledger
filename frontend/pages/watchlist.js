import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";

function readLocalWatchlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem("sentinel-watchlist-cache") || "[]");
    return Array.isArray(parsed) ? parsed.map((a) => ({ token_address: a, note: "", added_at: null })) : [];
  } catch {
    return [];
  }
}

function WatchSparkline() {
  return (
    <div className="flex h-7 items-end gap-1" aria-hidden>
      {[10, 16, 12, 22, 18, 25, 20].map((h, i) => (
        <span key={i} className="sl-sparkbar" style={{ height: `${h}px`, opacity: 0.45 + i * 0.06 }} />
      ))}
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

  return (
    <>
      <PageHead title={t("watchlist.pageTitle")} description={t("watchlist.pageDesc")} />
      <div className="sl-container py-10 space-y-6">
        <section className="sl-card-elevated sl-inset">
          <p className="sl-label">{t("watchlist.label")}</p>
          <h1 className="sl-h2 text-white mt-1">{t("watchlist.h1")}</h1>
          <p className="text-sm text-gray-400 mt-2">{token ? t("watchlist.subLive") : t("watchlist.subLocal")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost text-xs">remove all</button>
            <button type="button" className="btn-ghost text-xs">export</button>
          </div>
        </section>

        <section className="glass-card sl-inset">
          {loading ? <p className="text-sm text-gray-400">{t("watchlist.loading")}</p> : null}
          {!loading && error ? <p className="text-sm text-red-300">{t("watchlist.error", { err: error })}</p> : null}
          {!loading && !error && !list.length ? (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] px-5 py-8 text-center">
              <p className="text-gray-200">Start scanning to add tokens</p>
              <Link href="/scanner" className="mt-3 inline-flex btn-pro no-underline">Open Scanner</Link>
            </div>
          ) : null}
          {!loading && !error && list.length ? (
            <div className="overflow-x-auto">
              <table className="sl-table min-w-[760px]">
                <thead><tr><th>token</th><th>price</th><th>24h</th><th>score</th><th>signal</th><th>sparkline</th><th>notes</th><th>actions</th></tr></thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.token_address}>
                      <td className="font-mono text-cyan-200">{row.token_address?.slice(0, 6)}…{row.token_address?.slice(-6)}</td>
                      <td>—</td>
                      <td>—</td>
                      <td><div className="sl-score-bar w-24"><span style={{ width: "40%" }} /></div></td>
                      <td><span className="sl-badge sl-badge-indigo">WATCH</span></td>
                      <td><WatchSparkline /></td>
                      <td>{row.note || "—"}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <TerminalActionIcons mint={row.token_address} />
                          <Link href={`/token/${row.token_address}`} className="btn-ghost no-underline text-xs">{t("watchlist.open")}</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
