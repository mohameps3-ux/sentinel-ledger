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
        <section className="terminal-panel px-6 py-4 mb-4">
          <span className="section-title">WATCHLIST</span>
          <h1 className="font-display text-xl font-bold text-sl-text mt-1">
            Your Tokens
          </h1>
          <p className="font-ui text-sm text-sl-muted mt-1">{token ? t("watchlist.subLive") : t("watchlist.subLocal")}</p>
        </section>

        <section className="terminal-panel">
          <div className="panel-header">
            <span className="section-title">TRACKED TOKENS</span>
            <button type="button" className="btn-ghost-sm">EXPORT</button>
          </div>
          {loading ? <p className="text-sm text-sl-sub">{t("watchlist.loading")}</p> : null}
          {!loading && error ? <p className="text-sm text-red-300">{t("watchlist.error", { err: error })}</p> : null}
          {!loading && !error && !list.length ? (
            <div className="empty-state">
              <span className="empty-state-title">WATCHLIST EMPTY</span>
              <p className="empty-state-sub">
                Start scanning tokens to add them to your watchlist.
              </p>
              <Link href="/scanner" className="btn-primary mt-2 no-underline">OPEN SCANNER</Link>
            </div>
          ) : null}
          {!loading && !error && list.length ? (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th className="data-th">TOKEN</th>
                    <th className="data-th">PRICE</th>
                    <th className="data-th">24H</th>
                    <th className="data-th">SCORE</th>
                    <th className="data-th">SIGNAL</th>
                    <th className="data-th">ADDED</th>
                    <th className="data-th">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.token_address}>
                      <td className="data-td font-mono text-cyan-200">{row.token_address?.slice(0, 6)}…{row.token_address?.slice(-6)}</td>
                      <td className="data-td">—</td>
                      <td className="data-td data-neutral">—</td>
                      <td className="data-td">
                        <div className="score-track w-24">
                          <div className="score-fill-mid" style={{ width: "40%" }} />
                        </div>
                      </td>
                      <td className="data-td"><span className="sl-badge sl-badge-indigo">WATCH</span></td>
                      <td className="data-td">{row.added_at ? new Date(row.added_at).toLocaleDateString() : "—"}</td>
                      <td className="data-td">
                        <div className="flex items-center gap-2">
                          <TerminalActionIcons mint={row.token_address} />
                          <Link href={`/token/${row.token_address}`} className="btn-ghost-sm no-underline">{t("watchlist.open")}</Link>
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
