import toast from "react-hot-toast";
import { Copy, ShoppingCart, Star, Zap } from "lucide-react";

export function ActionBar({ tokenAddress, symbol, isWatchlisted = false, onToggleWatchlist }) {
  if (!tokenAddress) return null;
  const jupiterUrl = `https://jup.ag/swap/SOL-${tokenAddress}`;

  return (
    <div className="glass-card p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
      <div className="text-xs text-gray-400 mono hidden md:block">
        Mint: {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-6)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:flex xl:flex-wrap items-center gap-3 w-full md:w-auto">
      <a
        href={jupiterUrl}
        target="_blank"
        rel="noreferrer"
        className="h-11 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-black font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 transition"
      >
        <ShoppingCart size={16} />
        Buy {symbol || "Token"} on Jupiter
      </a>
      <button
        onClick={() => toast("One-click swap coming soon.")}
        className="h-11 px-5 rounded-xl bg-[#13171A] border soft-divider text-gray-100 inline-flex items-center justify-center gap-2 hover:bg-white/5 transition"
      >
        <Zap size={16} />
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
        className="h-11 px-4 rounded-xl bg-[#13171A] border soft-divider text-gray-100 inline-flex items-center justify-center gap-2 hover:bg-white/5 transition"
      >
        <Copy size={15} />
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

