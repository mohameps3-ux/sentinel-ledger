import Link from "next/link";
import { Activity, ArrowUpRight, Crosshair, ShieldAlert } from "lucide-react";
import {
  clampScore,
  convictionStatusKey
} from "../../lib/scannerTerminalModel.mjs";

const STATUS_TONE = {
  high: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
  neutral: "border-sky-300/25 bg-sky-300/10 text-sky-100",
  avoid: "border-rose-400/35 bg-rose-400/10 text-rose-100"
};

const SCORE_RING = {
  high: "from-emerald-300 via-cyan-300 to-zinc-700",
  neutral: "from-sky-300 via-indigo-300 to-zinc-700",
  avoid: "from-rose-300 via-amber-300 to-zinc-700"
};

export function ScannerDecisionHeader({ token, t }) {
  if (!token) {
    return (
      <div className="relative overflow-hidden border-b border-white/10 px-4 py-7 sm:px-6">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_55%)]" />
        <div className="relative flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400">
            <Crosshair size={18} />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{t("scanner.focus.emptyLabel")}</p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-500">{t("scanner.focus.emptyBody")}</p>
          </div>
        </div>
      </div>
    );
  }

  const mint = String(token.tokenAddress || token.mint || "");
  const sym = String(token.token || token.symbol || "-").replace(/^\$/, "");
  const score = clampScore(token.sentinelScore);
  const st = convictionStatusKey(score);
  const change = Number(token.change ?? token.change24h ?? token.priceChange24h);
  const pctCls =
    !Number.isFinite(change) ? "text-zinc-500" : change >= 0 ? "text-emerald-300" : "text-rose-300";

  return (
    <div className="relative overflow-hidden border-b border-white/10 bg-[linear-gradient(135deg,rgba(9,12,17,0.92),rgba(3,7,18,0.62))] px-4 py-5 sm:px-6">
      <div className="absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(circle_at_80%_15%,rgba(34,211,238,0.16),transparent_42%),radial-gradient(circle_at_55%_85%,rgba(16,185,129,0.1),transparent_38%)]" />
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] ${STATUS_TONE[st]}`}>
              <ShieldAlert size={13} />
              {t(`scanner.conviction.${st}`)}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] tabular-nums ${pctCls}`}>
              <Activity size={13} />
              {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "-"}
            </span>
          </div>

          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{t("scanner.focus.tokenLabel")}</p>
          <div className="mt-1 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">{sym}</h2>
              <p className="mt-2 break-all font-mono text-[11px] leading-snug text-zinc-500">{mint || "-"}</p>
            </div>
            <Link
              href={mint ? `/token/${encodeURIComponent(mint)}` : "#"}
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-300 no-underline transition hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-100 ${
                !mint ? "pointer-events-none opacity-40" : ""
              }`}
            >
              {t("scanner.table.intel")}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-md border border-white/10 bg-black/25 p-4 lg:justify-center">
          <div className={`grid h-28 w-28 shrink-0 place-items-center rounded-full bg-gradient-to-br p-[2px] ${SCORE_RING[st]}`}>
            <div className="grid h-full w-full place-items-center rounded-full bg-[#07090c]">
              <div className="text-center">
                <p className="font-mono text-3xl font-semibold tabular-nums leading-none text-zinc-50">{score}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">/100</p>
              </div>
            </div>
          </div>
          <div className="min-w-0 lg:hidden">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{t("scanner.focus.scoreLabel")}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("scanner.focus.statusLabel")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
