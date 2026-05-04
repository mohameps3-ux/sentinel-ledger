import { clampScore } from "../../lib/scannerTerminalModel.mjs";
import { TerminalActionIcons } from "../terminal/TerminalActionIcons";
import Link from "next/link";

export function ScannerTokenTable({ rows, focusedMint, onFocusMint, t }) {
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
            const sym = String(token.token || token.symbol || "—").replace(/^\$/, "");
            const score = clampScore(token.sentinelScore);
            const liq = Number(token.liquidityUsd ?? token.liquidity ?? 0);
            const vol = Number(token.volume24h || 0);
            const change = Number(token.change ?? token.change24h ?? token.priceChange24h);
            const active = focusedMint && mint === focusedMint;
            const chgCls =
              !Number.isFinite(change) ? "text-zinc-600" : change >= 0 ? "text-emerald-500" : "text-red-500";
            return (
              <tr
                key={mint || sym}
                className={`cursor-pointer border-b border-white/[0.06] font-mono text-xs transition-colors ${
                  active ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"
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
                    {mint ? `${String(mint).slice(0, 6)}…${String(mint).slice(-4)}` : "—"}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-200">{score}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">${liq.toLocaleString()}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">${vol.toLocaleString()}</td>
                <td className={`py-2.5 pr-3 text-right tabular-nums ${chgCls}`}>
                  {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                </td>
                <td className="py-2.5 pr-2 text-right sm:pr-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={mint ? `/token/${encodeURIComponent(mint)}` : "#"}
                      className={`text-[10px] font-mono uppercase tracking-wider text-amber-500/90 no-underline hover:text-amber-400 ${
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
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-zinc-600">{t("scanner.table.empty")}</p>
      ) : null}
    </div>
  );
}
