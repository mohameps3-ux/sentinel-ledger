import Link from "next/link";
import { clampScore } from "../../lib/scannerTerminalModel.mjs";
import { TerminalActionIcons } from "../terminal/TerminalActionIcons";
import { formatCompact } from "../../lib/formatStable";

function EmptyState({ status, t }) {
  const isError = status?.kind && status.kind !== "no_data";
  const copy =
    status?.kind === "backend_offline"
      ? { icon: "⚡", title: "Backend offline", body: "The trading API is unreachable. Try refreshing in a moment." }
      : status?.kind === "wrong_endpoint"
        ? { icon: "⚠", title: "Wrong endpoint", body: "API returned 404. The frontend may be pointed at the wrong origin." }
        : status?.kind === "backend_error"
          ? { icon: "✕", title: "Backend error", body: "The service returned an error while loading the scanner universe." }
          : { icon: "◎", title: "Scanning universe", body: t("scanner.table.empty") };
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg ${isError ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-cyan-500/20 bg-cyan-500/08 text-cyan-500 animate-pulse"}`}>
        {copy.icon}
      </span>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-300">{copy.title}</p>
      <p className="mx-auto max-w-xs text-[11px] leading-relaxed text-zinc-600">{copy.body}</p>
      {status?.status != null && isError ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-700">
          {status.kind}
        </p>
      ) : null}
    </div>
  );
}

export function ScannerTokenTable({ rows, focusedMint, onFocusMint, t, status }) {
  return (
    <div className="overflow-x-auto px-2 pb-4 pt-2 sm:px-3">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
            <th className="py-2 pl-2 pr-3 font-medium sm:pl-3">{t("scanner.table.token")}</th>
            <th className="py-2 pr-3 text-right font-medium">{t("scanner.table.score")}</th>
            <th className="py-2 pr-3 text-right font-medium">{t("scanner.table.liquidity")}</th>
            <th className="py-2 pr-3 text-right font-medium">{t("scanner.table.volume")}</th>
            <th className="py-2 pr-3 text-right font-medium">{t("scanner.table.change")}</th>
            <th className="py-2 pr-2 text-right font-medium sm:pr-3">{t("scanner.table.route")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((token) => {
            const mint = token.tokenAddress || token.mint;
            const sym = String(token.token || token.symbol || "-").replace(/^\$/, "");
            const score = clampScore(token.sentinelScore);
            const liq = Number(token.liquidityUsd ?? token.liquidity ?? 0);
            const vol = Number(token.volume24h || 0);
            const change = Number(token.change ?? token.change24h ?? token.priceChange24h);
            const active = focusedMint && mint === focusedMint;
            const chgCls =
              !Number.isFinite(change) ? "text-zinc-600" : change >= 0 ? "text-emerald-400" : "text-rose-400";
            const scoreCls =
              score >= 75
                ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                : score >= 45
                  ? "border-sky-300/20 bg-sky-300/10 text-sky-100"
                  : "border-rose-300/20 bg-rose-300/10 text-rose-100";

            return (
              <tr
                key={mint || sym}
                className={`cursor-pointer border-b border-white/[0.06] font-mono text-xs outline-none transition-colors ${
                  active ? "bg-cyan-300/[0.08] shadow-[inset_3px_0_0_rgba(103,232,249,0.75)]" : "hover:bg-white/[0.035] focus:bg-white/[0.04]"
                }`}
                onClick={() => mint && onFocusMint(mint)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (mint) onFocusMint(mint);
                  }
                }}
                tabIndex={0}
                role="row"
              >
                <td className="max-w-[200px] py-2.5 pl-2 pr-3 sm:pl-3">
                  <span className="block truncate text-zinc-100">{sym}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-zinc-600">
                    {mint ? `${String(mint).slice(0, 6)}...${String(mint).slice(-4)}` : "-"}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  <span className={`inline-flex min-w-9 justify-center rounded-md border px-2 py-1 ${scoreCls}`}>{score}</span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">{formatCompact(liq)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">{formatCompact(vol)}</td>
                <td className={`py-2.5 pr-3 text-right tabular-nums ${chgCls}`}>
                  {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "-"}
                </td>
                <td className="py-2.5 pr-2 text-right sm:pr-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={mint ? `/token/${encodeURIComponent(mint)}` : "#"}
                      className={`rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-cyan-200/90 no-underline transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100 ${
                        !mint ? "pointer-events-none opacity-40" : ""
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("scanner.table.intel")}
                    </Link>
                    <TerminalActionIcons mint={mint} variant="institutional" className="inline-flex" />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <EmptyState status={status} t={t} /> : null}
    </div>
  );
}
