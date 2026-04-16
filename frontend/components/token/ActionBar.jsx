import toast from "react-hot-toast";
import { ShoppingCart, Zap } from "lucide-react";

export function ActionBar({ tokenAddress, symbol }) {
  if (!tokenAddress) return null;
  const jupiterUrl = `https://jup.ag/swap/SOL-${tokenAddress}`;

  return (
    <div className="glass-card p-4 flex flex-wrap items-center gap-3">
      <a
        href={jupiterUrl}
        target="_blank"
        rel="noreferrer"
        className="h-11 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-black font-semibold inline-flex items-center gap-2 hover:opacity-90 transition"
      >
        <ShoppingCart size={16} />
        Buy {symbol || "Token"} on Jupiter
      </a>
      <button
        onClick={() => toast("One-click swap coming soon.")}
        className="h-11 px-5 rounded-xl bg-[#13171A] border soft-divider text-gray-100 inline-flex items-center gap-2 hover:bg-white/5 transition"
      >
        <Zap size={16} />
        Swap (1-click)
      </button>
    </div>
  );
}

