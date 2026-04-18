import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { PageHead } from "../components/seo/PageHead";

function readLocalWatchlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem("sentinel-watchlist-cache") || "[]");
    return Array.isArray(parsed) ? parsed.map((a) => ({ token_address: a, note: "", added_at: null })) : [];
  } catch {
    return [];
  }
}

export default function WatchlistPage() {
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
      <PageHead
        title="Watchlist — Sentinel Ledger"
        description="Tracked Solana tokens with notes. Syncs to your account when signed in."
      />
    <div className="sl-container py-10 space-y-6">
      <section className="glass-card sl-inset">
        <p className="sl-label">Watchlist</p>
        <h1 className="sl-h2 text-white mt-1">Tracked tokens</h1>
        <p className="text-sm text-gray-400 mt-2">
          {token ? "Live from your account." : "No signed session: showing local cached watchlist only."}
        </p>
      </section>

      <section className="glass-card sl-inset">
        {loading ? <p className="text-sm text-gray-400">Loading watchlist...</p> : null}
        {!loading && error ? <p className="text-sm text-red-300">Could not load watchlist: {error}</p> : null}
        {!loading && !error && !list.length ? (
          <p className="text-sm text-gray-400">No tokens yet. Add one from any token page.</p>
        ) : null}
        {!loading && !error && list.length ? (
          <div className="space-y-2">
            {list.map((row) => (
              <div key={row.token_address} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="mono text-sm text-gray-200">{row.token_address}</p>
                  {row.note ? <p className="text-xs text-gray-500 mt-1">{row.note}</p> : null}
                </div>
                <Link href={`/token/${row.token_address}`} className="btn-ghost no-underline">Open</Link>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
    </>
  );
}
