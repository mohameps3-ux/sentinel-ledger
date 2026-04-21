import { formatTimeAgo } from "@/lib/formatters";

export function HistoryTab({ historyRows }) {
  return (
    <section translate="no" className="sl-section">
      <h2 className="sl-h2 text-white mb-2">24h verified outcomes</h2>
      <p className="text-xs text-gray-500 mb-4">On-chain linked signals from the last 24 hours.</p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {historyRows.length === 0 ? (
          <p className="text-sm text-gray-500 col-span-full">
            No rows in the last 24h. Add signals and prices in Supabase, or switch to LIVE.
          </p>
        ) : (
          historyRows.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border p-4 space-y-2 font-mono text-sm ${
                r.status === "WIN"
                  ? "bg-emerald-500/[0.06] border-emerald-500/25"
                  : r.status === "LOSS"
                    ? "bg-red-500/[0.06] border-red-500/25"
                    : "bg-white/[0.02] border-white/10"
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="text-gray-200">{r.token?.slice(0, 8)}…</span>
                <span
                  className={
                    r.status === "WIN" ? "text-emerald-300" : r.status === "LOSS" ? "text-red-300" : "text-gray-400"
                  }
                >
                  {r.status}
                </span>
              </div>
              <p className="text-emerald-200">
                {r.resultPct != null && !Number.isNaN(Number(r.resultPct))
                  ? `${Number(r.resultPct) >= 0 ? "+" : ""}${Number(r.resultPct).toFixed(1)}% (1h est.)`
                  : "PENDING"}
              </p>
              <p className="text-[11px] text-gray-500">Signal {formatTimeAgo(r.signalAt)} — result verified on-chain</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
