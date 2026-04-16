import { GradeBadge } from "./GradeBadge";
import { ArrowUpRight, Bell, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

export function HeroSection({ symbol, price, priceChange, grade, confidence, tokenAddress }) {
  const up = Number(priceChange || 0) >= 0;
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertType, setAlertType] = useState("grade");

  const riskMeta = useMemo(() => {
    const score = Number(confidence || 0);
    if (score >= 85) {
      return {
        className: "risk-badge-success",
        label: "✅ ALTO POTENCIAL",
        tooltip: "High viability based on current sentinel metrics."
      };
    }
    if (score >= 70) {
      return {
        className: "risk-badge-warning",
        label: "👀 VIGILAR",
        tooltip: "Mixed signal. Watch liquidity and holder concentration."
      };
    }
    return {
      className: "risk-badge-danger",
      label: "⚠️ ALTO RIESGO",
      tooltip: "High risk profile from current contract and market data."
    };
  }, [confidence]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied.");
    } catch (_) {
      toast.error("Could not copy link.");
    }
  };

  const handleAlert = () => {
    const hasToken = typeof window !== "undefined" && !!localStorage.getItem("token");
    if (!hasToken) {
      toast.error("Connect wallet to configure alerts.");
      return;
    }
    setShowAlertModal(true);
  };

  const saveAlert = () => {
    try {
      const list = JSON.parse(localStorage.getItem("sentinel-alerts") || "[]");
      list.push({
        tokenAddress,
        symbol,
        alertType,
        createdAt: Date.now()
      });
      localStorage.setItem("sentinel-alerts", JSON.stringify(list));
      toast.success("Alert saved locally.");
      setShowAlertModal(false);
    } catch (_) {
      toast.error("Could not save alert.");
    }
  };

  return (
    <>
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
            <span className={riskMeta.className} title={riskMeta.tooltip}>
              {riskMeta.label}
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

      {showAlertModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-5">
            <h3 className="text-lg font-semibold mb-2">Configure Alert</h3>
            <p className="text-sm text-gray-400 mb-4">Token: {symbol || tokenAddress}</p>
            <label className="block text-sm mb-2">Alert type</label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              className="w-full bg-[#0E1318] border soft-divider rounded-xl h-10 px-3 text-sm mb-4"
            >
              <option value="grade">Grade change</option>
              <option value="volume">Abnormal volume</option>
              <option value="selloff">Massive sell pressure</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAlertModal(false)}
                className="h-9 px-3 rounded-lg border soft-divider text-sm hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={saveAlert}
                className="h-9 px-3 rounded-lg text-sm bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition"
              >
                Save Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

