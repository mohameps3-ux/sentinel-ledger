import {
  clampScore,
  convictionStatusKey
} from "../../lib/scannerTerminalModel.mjs";

const STATUS_TONE = {
  high: "text-emerald-500",
  neutral: "text-zinc-400",
  avoid: "text-red-500"
};

/**
 * Full-bleed decision header: operable? risk tier visible via status; no card chrome.
 */
export function ScannerDecisionHeader({ token, t }) {
  if (!token) {
    return (
      <div className="border-b border-white/10 px-4 py-6 sm:px-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{t("scanner.focus.emptyLabel")}</p>
        <p className="mt-2 text-sm text-zinc-500">{t("scanner.focus.emptyBody")}</p>
      </div>
    );
  }

  const mint = String(token.tokenAddress || token.mint || "");
  const sym = String(token.token || token.symbol || "—").replace(/^\$/, "");
  const score = clampScore(token.sentinelScore);
  const st = convictionStatusKey(score);
  const change = Number(token.change ?? token.change24h ?? token.priceChange24h);
  const pctCls =
    !Number.isFinite(change) ? "text-zinc-600" : change >= 0 ? "text-emerald-500" : "text-red-500";

  return (
    <div className="border-b border-white/10 px-4 py-6 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
              {t("scanner.focus.tokenLabel")}{" "}
              <span className="text-zinc-300">{sym}</span>
            </p>
            <p className="mt-1 break-all font-mono text-[11px] leading-snug text-zinc-500">{mint || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{t("scanner.focus.statusLabel")}</p>
            <p className={`mt-0.5 text-sm font-semibold uppercase tracking-wide ${STATUS_TONE[st]}`}>
              {t(`scanner.conviction.${st}`)}
            </p>
          </div>
          <p className={`font-mono text-sm tabular-nums ${pctCls}`}>
            {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
          </p>
        </div>
        <div className="shrink-0 text-left lg:text-right">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{t("scanner.focus.scoreLabel")}</p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums leading-none tracking-tight text-zinc-50 sm:text-5xl">
            {score}
            <span className="text-lg font-normal text-zinc-600 sm:text-xl"> / 100</span>
          </p>
        </div>
      </div>
    </div>
  );
}
