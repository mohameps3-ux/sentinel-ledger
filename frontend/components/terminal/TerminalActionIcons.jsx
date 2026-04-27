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

const btnBase =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border text-gray-200 transition-all duration-150 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(250,204,21,0.5)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#050505]";

/**
 * Unified JUP / DEX / DESK muscle-memory row (terminal HUD).
 * @param {string} mint
 * @param {(mint: string) => void} [onShallowDesk] — home cockpit: pin mint via `?t=` (caller builds router).
 * @param {string} [className]
 */
export function TerminalActionIcons({ mint, onShallowDesk, className = "" }) {
  const { t } = useLocale();
  const ok = Boolean(mint && isProbableSolanaMint(mint) && isValidSolanaAddress(mint));
  const jup = ok ? buildJupiterSwapUrl(mint) : "#";
  const dex = ok ? buildDexscreenerSolanaTokenUrl(mint) : "#";
  const fullDesk = ok ? `/token/${encodeURIComponent(mint)}` : "#";

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
        className={`${btnBase} border-emerald-500/35 bg-emerald-500/[0.08] hover:border-emerald-400/55 hover:bg-emerald-500/15 hover:shadow-[0_0_12px_rgba(16,185,129,0.2)] ${!ok ? "pointer-events-none opacity-40" : ""}`}
        onClick={(e) => !ok && e.preventDefault()}
      >
        <Bolt size={15} strokeWidth={2.2} className="text-emerald-200" aria-hidden />
      </a>
      <a
        href={dex}
        target="_blank"
        rel={EXTERNAL_ANCHOR_REL}
        title={t("terminal.actions.dex")}
        aria-label={t("terminal.actions.dex")}
        className={`${btnBase} border-[rgba(209,213,219,0.22)] bg-[rgba(209,213,219,0.06)] hover:border-[rgba(250,204,21,0.5)] hover:bg-[rgba(250,204,21,0.10)] hover:shadow-[0_0_12px_rgba(250,204,21,0.18)] ${!ok ? "pointer-events-none opacity-40" : ""}`}
        onClick={(e) => !ok && e.preventDefault()}
      >
        <LineChart size={14} strokeWidth={2} className="text-[#d1d5db]" aria-hidden />
      </a>
      {typeof onShallowDesk === "function" && ok ? (
        <button
          type="button"
          title={t("terminal.actions.deskShallow")}
          aria-label={t("terminal.actions.deskShallow")}
          className={`${btnBase} border-[rgba(250,204,21,0.4)] bg-[rgba(250,204,21,0.08)] hover:border-[rgba(250,204,21,0.6)] hover:bg-[rgba(250,204,21,0.14)] hover:shadow-[0_0_12px_rgba(250,204,21,0.22)]`}
          onClick={() => onShallowDesk(mint)}
        >
          <SquareTerminal size={14} strokeWidth={2} className="text-[#fef08a]" aria-hidden />
        </button>
      ) : (
        <Link
          href={fullDesk}
          title={t("terminal.actions.deskFull")}
          aria-label={t("terminal.actions.deskFull")}
          className={`${btnBase} border-[rgba(250,204,21,0.4)] bg-[rgba(250,204,21,0.08)] hover:border-[rgba(250,204,21,0.6)] hover:bg-[rgba(250,204,21,0.14)] hover:shadow-[0_0_12px_rgba(250,204,21,0.22)] no-underline ${!ok ? "pointer-events-none opacity-40" : ""}`}
        >
          <SquareTerminal size={14} strokeWidth={2} className="text-[#fef08a]" aria-hidden />
        </Link>
      )}
    </div>
  );
}
