import { GradeBadge } from "./GradeBadge";
import { ArrowUpRight, Bell, Copy } from "lucide-react";
import toast from "react-hot-toast";

export function HeroSection({ symbol, price, priceChange, grade, confidence, tokenAddress }) {
  const up = Number(priceChange || 0) >= 0;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied.");
    } catch (_) {
      toast.error("Could not copy link.");
    }
  };

  const handleAlert = () => {
    toast.success(`Alert configured for ${symbol || tokenAddress || "token"}.`);
  };

  return (
    <div className="glass-card glass-card-hover p-6 w-full">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
        <div>
          <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent">
            {symbol}
          </h1>
          <div className="flex items-center gap-3 mt-3">
            <span className="text-3xl md:text-4xl font-extrabold">${Number(price || 0).toLocaleString()}</span>
            <span
              className={`inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-full ${
                up ? "text-emerald-300 bg-emerald-500/10" : "text-red-300 bg-red-500/10"
              }`}
            >
              <ArrowUpRight size={14} className={!up ? "rotate-90" : ""} />
              {up ? "+" : ""}
              {priceChange}%
            </span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <GradeBadge grade={grade} confidence={confidence} />
          <button
            onClick={handleShare}
            className="h-10 px-3 rounded-xl border soft-divider text-sm text-gray-200 hover:bg-white/5 transition inline-flex items-center gap-2"
          >
            <Copy size={15} />
            Share
          </button>
          <button
            onClick={handleAlert}
            className="h-10 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-sm font-semibold hover:opacity-90 transition inline-flex items-center gap-2"
          >
            <Bell size={15} />
            Alert
          </button>
        </div>
      </div>
    </div>
  );
}

