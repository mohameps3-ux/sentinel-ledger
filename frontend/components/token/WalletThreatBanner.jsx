import { useMemo } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useWalletLabels } from "../../hooks/useWalletLabels";

function shortAddr(a) {
  if (!a || a.length < 12) return a || "";
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function WalletThreatBanner({ walletIntel }) {
  const threatAddrs = useMemo(
    () =>
      (walletIntel?.signals || [])
        .map((s) => s.wallet)
        .filter((w) => w && typeof w === "string" && w.length >= 32 && w.length <= 44),
    [walletIntel]
  );
  const { labelFor, titleFor } = useWalletLabels(threatAddrs);

  if (!walletIntel || walletIntel.level === "none") return null;

  const border =
    walletIntel.level === "high"
      ? "border-red-500/50 bg-red-950/25"
      : walletIntel.level === "medium"
        ? "border-amber-500/45 bg-amber-950/20"
        : "border-amber-600/35 bg-[#13171A]";

  return (
    <div className={`rounded-2xl border p-4 ${border}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {walletIntel.level === "high" ? (
            <ShieldAlert className="text-red-400" size={22} />
          ) : (
            <AlertTriangle className="text-amber-400" size={22} />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="font-semibold text-gray-100">
            Wallet activity alert ({walletIntel.level})
          </div>
          {walletIntel.summary ? (
            <p className="text-sm text-gray-400 leading-snug">{walletIntel.summary}</p>
          ) : null}
          {walletIntel.signals?.length ? (
            <ul className="text-xs text-gray-500 space-y-1.5 list-none">
              {walletIntel.signals.slice(0, 6).map((s, i) => (
                <li key={`${s.type}-${s.wallet}-${i}`} className="flex flex-wrap gap-x-2 gap-y-0.5">
                  <span
                    className="font-mono text-gray-300"
                    title={s.wallet && s.wallet.length >= 32 ? titleFor(s.wallet) : s.wallet}
                  >
                    {s.wallet && s.wallet.length >= 32 ? labelFor(s.wallet) : shortAddr(s.wallet)}
                  </span>
                  <span className="text-gray-600">·</span>
                  <span>{s.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[10px] text-gray-600 leading-snug">
            Heuristic scan (Helius sample + deployer history). Not a court verdict — verify independently.
          </p>
        </div>
      </div>
    </div>
  );
}
