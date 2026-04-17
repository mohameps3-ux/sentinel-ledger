import { GradeBadge } from "./GradeBadge";
import { ArrowUpRight, Bell, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { formatTokenPrice } from "../../lib/formatStable";
import { ProButton } from "../ui/ProButton";

export function HeroSection({ symbol, price, priceChange, grade, confidence, tokenAddress }) {
  const up = Number(priceChange || 0) >= 0;
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertType, setAlertType] = useState("grade");

  const riskMeta = useMemo(() => {
    const score = Number(confidence || 0);
    if (score >= 85) {
      return {
        className: "risk-badge-success",
        label: "Alto potencial",
        tooltip: "High viability based on current sentinel metrics."
      };
    }
    if (score >= 70) {
      return {
        className: "risk-badge-warning",
        label: "Vigilar",
        tooltip: "Mixed signal. Watch liquidity and holder concentration."
      };
    }
    return {
      className: "risk-badge-danger",
      label: "Alto riesgo",
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
      <div className="glass-card glass-card-hover sl-inset w-full" translate="no">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2 min-w-0 flex-1">
              <p className="sl-label">Token</p>
              <h1 className="sl-h1 text-white tracking-tight" translate="no">
                {symbol || "—"}
              </h1>
              <p className="mono text-[12px] text-gray-500 break-all max-w-2xl leading-relaxed">{tokenAddress}</p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-3">
              <GradeBadge grade={grade} confidence={confidence} />
            </div>
          </div>

          <div className="sl-divider" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="sl-label mb-2">Price</p>
              <p className="text-2xl md:text-3xl font-bold text-white tracking-tight">${formatTokenPrice(price)}</p>
            </div>
            <div>
              <p className="sl-label mb-2">24h change</p>
              <p
                className={`text-xl md:text-2xl font-semibold inline-flex items-center gap-2 ${
                  up ? "text-emerald-300" : "text-red-300"
                }`}
              >
                <ArrowUpRight size={22} className={!up ? "rotate-90" : ""} />
                {up ? "+" : ""}
                {priceChange}%
              </p>
            </div>
            <div className="flex flex-col justify-end">
              <p className="sl-label mb-2">Risk band</p>
              <span className={`${riskMeta.className} w-fit`} title={riskMeta.tooltip}>
                {riskMeta.label}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <ProButton variant="ghost" type="button" onClick={handleShare}>
              <Copy size={16} />
              Share link
            </ProButton>
            <ProButton type="button" onClick={handleAlert}>
              <Bell size={16} />
              Set alert
            </ProButton>
          </div>
        </div>
      </div>

      {showAlertModal && (
        <div className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card sl-inset w-full max-w-md space-y-5">
            <div>
              <h3 className="sl-h2 text-white mb-1">Configure alert</h3>
              <p className="sl-body sl-muted" translate="no">
                Token: {symbol || tokenAddress}
              </p>
            </div>
            <div>
              <label className="sl-label mb-2 block">Alert type</label>
              <select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value)}
                className="sl-input h-11 px-3 w-full"
              >
                <option value="grade">Grade change</option>
                <option value="volume">Abnormal volume</option>
                <option value="selloff">Massive sell pressure</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <ProButton variant="ghost" type="button" onClick={() => setShowAlertModal(false)}>
                Cancel
              </ProButton>
              <ProButton type="button" onClick={saveAlert}>
                Save alert
              </ProButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
