import toast from "react-hot-toast";
import { Copy, ExternalLink, LineChart, Search, ShoppingCart, Star, Zap } from "lucide-react";
import {
  buildDexscreenerSolanaTokenUrl,
  buildJupiterSwapUrl,
  buildMeteoraPoolUrl,
  buildPumpFunTokenUrl,
  buildSolscanTokenUrl,
  EXTERNAL_ANCHOR_REL
} from "../../lib/terminalLinks";

function hasPumpRoute(market) {
  const pairs = Array.isArray(market?.dexPairs) ? market.dexPairs : [];
  const pairUrl = String(market?.pairUrl || "").toLowerCase();
  return pairUrl.includes("pump.fun") || pairs.some((p) => String(p?.dexId || "").toLowerCase().includes("pump"));
}

function meteoraPool(market) {
  const pairs = Array.isArray(market?.dexPairs) ? market.dexPairs : [];
  return pairs.find((p) => String(p?.dexId || "").toLowerCase().includes("meteora") && p?.pairAddress)?.pairAddress || null;
}

export function ActionBar({ tokenAddress, symbol, market, isWatchlisted = false, onToggleWatchlist }) {
  if (!tokenAddress) return null;
  const jupiterUrl = buildJupiterSwapUrl(tokenAddress);
  const dexUrl = buildDexscreenerSolanaTokenUrl(tokenAddress);
  const solscanUrl = buildSolscanTokenUrl(tokenAddress);
  const pumpUrl = hasPumpRoute(market) ? buildPumpFunTokenUrl(tokenAddress) : null;
  const meteoraUrl = buildMeteoraPoolUrl(meteoraPool(market));

  return (
    <div className="glass-card p-4 flex flex-col lg:flex-row lg:items-center gap-3 justify-between border-emerald-500/20 bg-emerald-500/[0.03]">
      <div className="text-xs text-gray-400 mono hidden md:block">
        <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80 font-semibold">Execution scope</span>
        <br />
        Mint: {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-6)}
      </div>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
      <a
        href={jupiterUrl}
        target="_blank"
        rel={EXTERNAL_ANCHOR_REL}
        className="col-span-2 h-12 px-5 rounded-xl bg-emerald-400 text-black font-black uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 hover:bg-emerald-300 transition"
      >
        <ShoppingCart size={16} />
        Trade now {symbol || "Token"}
      </a>
      <a
        href={dexUrl}
        target="_blank"
        rel={EXTERNAL_ANCHOR_REL}
        className="h-9 px-3 rounded-xl bg-[#13171A] border soft-divider text-cyan-100 inline-flex items-center justify-center gap-2 hover:bg-white/5 transition text-xs font-semibold"
      >
        <LineChart size={14} />
        DEX
      </a>
      <a
        href={solscanUrl}
        target="_blank"
        rel={EXTERNAL_ANCHOR_REL}
        className="h-9 px-3 rounded-xl bg-[#13171A] border soft-divider text-gray-100 inline-flex items-center justify-center gap-2 hover:bg-white/5 transition text-xs font-semibold"
      >
        <Search size={14} />
        Solscan
      </a>
      {pumpUrl ? (
        <a
          href={pumpUrl}
          target="_blank"
          rel={EXTERNAL_ANCHOR_REL}
          className="h-9 px-3 rounded-xl bg-[#13171A] border soft-divider text-fuchsia-100 inline-flex items-center justify-center gap-2 hover:bg-white/5 transition text-xs font-semibold"
        >
          Pump <ExternalLink size={12} />
        </a>
      ) : null}
      {meteoraUrl ? (
        <a
          href={meteoraUrl}
          target="_blank"
          rel={EXTERNAL_ANCHOR_REL}
          className="h-9 px-3 rounded-xl bg-[#13171A] border soft-divider text-orange-100 inline-flex items-center justify-center gap-2 hover:bg-white/5 transition text-xs font-semibold"
        >
          Meteora <ExternalLink size={12} />
        </a>
      ) : null}
      <button
        onClick={() => toast("One-click swap coming soon.")}
        className="h-9 px-3 rounded-xl bg-[#13171A] border soft-divider text-gray-100 inline-flex items-center justify-center gap-2 hover:bg-white/5 transition text-xs font-semibold"
      >
        <Zap size={14} />
        Swap (1-click)
      </button>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(tokenAddress);
            toast.success("Mint copied.");
          } catch (_) {
            toast.error("Copy failed.");
          }
        }}
        className="h-9 px-3 rounded-xl bg-[#13171A] border soft-divider text-gray-100 inline-flex items-center justify-center gap-2 hover:bg-white/5 transition text-xs font-semibold"
      >
        <Copy size={13} />
        Copy Mint
      </button>
      {typeof onToggleWatchlist === "function" ? (
        <button
          onClick={onToggleWatchlist}
          className={`h-11 px-4 rounded-xl inline-flex items-center justify-center gap-2 transition ${
            isWatchlisted
              ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90"
              : "bg-[#13171A] border soft-divider text-gray-100 hover:bg-white/5"
          }`}
        >
          <Star size={15} />
          {isWatchlisted ? "Watchlisted" : "Add Watchlist"}
        </button>
      ) : null}
      </div>
    </div>
  );
}

