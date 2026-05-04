import Link from "next/link";
import { Bolt, LineChart, SquareTerminal } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext";
import {
  buildDexscreenerSolanaTokenUrl,
  buildJupiterSwapUrl,
  EXTERNAL_ANCHOR_REL,
  isValidSolanaAddress
} from "../../lib/terminalLinks";
import { isProbableSolanaMint } from "../../lib/solanaMint.mjs";

const btnRetail =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border text-gray-200 transition-all duration-150 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(250,204,21,0.5)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#050505]";

const btnInstitutional =
  "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-zinc-700/90 bg-zinc-900/60 text-zinc-300 backdrop-blur-sm transition-all duration-150 hover:border-zinc-600 hover:bg-zinc-800/80 hover:text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#050505]";

/**
 * Unified JUP / DEX / DESK muscle-memory row (terminal HUD).
 * @param {string} mint
 * @param {(mint: string) => void} [onShallowDesk] — home cockpit: pin mint via `?t=` (caller builds router).
 * @param {string} [className]
 * @param {"retail" | "institutional"} [variant]
 */
export function TerminalActionIcons({ mint, onShallowDesk, className = "", variant = "retail" }) {
  const { t } = useLocale();
  const ok = Boolean(mint && isProbableSolanaMint(mint) && isValidSolanaAddress(mint));
  const jup = ok ? buildJupiterSwapUrl(mint) : "#";
  const dex = ok ? buildDexscreenerSolanaTokenUrl(mint) : "#";
  const fullDesk = ok ? `/token/${encodeURIComponent(mint)}` : "#";
  const btnBase = variant === "institutional" ? btnInstitutional : btnRetail;
  const stroke = variant === "institutional" ? 1.15 : 2.2;
  const strokeDex = variant === "institutional" ? 1.05 : 2;
  const jupCls =
    variant === "institutional"
      ? `${btnBase} ${!ok ? "pointer-events-none opacity-40" : "border-emerald-800/60 text-emerald-500/95 hover:border-emerald-700/70 hover:text-emerald-400"}`
      : `${btnBase} border-emerald-500/35 bg-emerald-500/[0.08] hover:border-emerald-400/55 hover:bg-emerald-500/15 hover:shadow-[0_0_12px_rgba(16,185,129,0.2)] ${!ok ? "pointer-events-none opacity-40" : ""}`;
  const dexCls =
    variant === "institutional"
      ? `${btnBase} ${!ok ? "pointer-events-none opacity-40" : "text-zinc-400"}`
      : `${btnBase} border-[rgba(209,213,219,0.22)] bg-[rgba(209,213,219,0.06)] hover:border-[rgba(250,204,21,0.5)] hover:bg-[rgba(250,204,21,0.10)] hover:shadow-[0_0_12px_rgba(250,204,21,0.18)] ${!ok ? "pointer-events-none opacity-40" : ""}`;
  const deskCls =
    variant === "institutional"
      ? `${btnBase} ${!ok ? "pointer-events-none opacity-40" : "border-amber-900/50 text-amber-500/95 hover:border-amber-800/60 hover:text-amber-400"}`
      : `${btnBase} border-[rgba(250,204,21,0.4)] bg-[rgba(250,204,21,0.08)] hover:border-[rgba(250,204,21,0.6)] hover:bg-[rgba(250,204,21,0.14)] hover:shadow-[0_0_12px_rgba(250,204,21,0.22)]`;

  return (
    <div
      className={`flex items-center justify-center gap-1 ${className}`}
      data-terminal-action="1"
      data-no-row-expand="1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <a
        href={jup}
        target="_blank"
        rel={EXTERNAL_ANCHOR_REL}
        title={t("terminal.actions.jupiter")}
        aria-label={t("terminal.actions.jupiter")}
        className={jupCls}
        onClick={(e) => !ok && e.preventDefault()}
      >
        <Bolt size={14} strokeWidth={stroke} className={variant === "institutional" ? "text-emerald-500" : "text-emerald-200"} aria-hidden />
      </a>
      <a
        href={dex}
        target="_blank"
        rel={EXTERNAL_ANCHOR_REL}
        title={t("terminal.actions.dex")}
        aria-label={t("terminal.actions.dex")}
        className={dexCls}
        onClick={(e) => !ok && e.preventDefault()}
      >
        <LineChart size={13} strokeWidth={strokeDex} className={variant === "institutional" ? "text-zinc-400" : "text-[#d1d5db]"} aria-hidden />
      </a>
      {typeof onShallowDesk === "function" && ok ? (
        <button
          type="button"
          title={t("terminal.actions.deskShallow")}
          aria-label={t("terminal.actions.deskShallow")}
          className={deskCls}
          onClick={() => onShallowDesk(mint)}
        >
          <SquareTerminal size={13} strokeWidth={strokeDex} className={variant === "institutional" ? "text-amber-500" : "text-[#fef08a]"} aria-hidden />
        </button>
      ) : (
        <Link
          href={fullDesk}
          title={t("terminal.actions.deskFull")}
          aria-label={t("terminal.actions.deskFull")}
          className={`${deskCls} no-underline ${!ok ? "pointer-events-none opacity-40" : ""}`}
        >
          <SquareTerminal size={13} strokeWidth={strokeDex} className={variant === "institutional" ? "text-amber-500" : "text-[#fef08a]"} aria-hidden />
        </Link>
      )}
    </div>
  );
}
