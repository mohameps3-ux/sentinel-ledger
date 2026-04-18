import { ArrowDown, ArrowUp, ExternalLink, Bell, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { formatTime, formatUsdWhole } from "../../lib/formatStable";
import { useMemo } from "react";
import { useWalletLabels } from "../../hooks/useWalletLabels";

const WHALE_USD_MIN = 5000;

function shortWallet(wallet = "") {
  if (!wallet) return "unknown";
  return `${wallet.slice(0, 5)}...${wallet.slice(-4)}`;
}

function isWhaleTx(tx, tokenPriceUsd) {
  const price = Number(tokenPriceUsd);
  const amt = Number(tx.amount);
  if (!Number.isFinite(price) || price <= 0) return false;
  if (!Number.isFinite(amt) || amt <= 0) return false;
  return amt * price >= WHALE_USD_MIN;
}

export function LiveFlowPanel({ transactions = [], tokenPriceUsd = 0 }) {
  const flowWalletAddrs = useMemo(() => {
    const s = new Set();
    transactions.forEach((tx) => {
      const w = tx.wallet || tx.trader || tx.from;
      if (w && typeof w === "string" && w.length >= 32 && w.length <= 44) s.add(w);
    });
    return Array.from(s);
  }, [transactions]);
  const { labelFor, titleFor } = useWalletLabels(flowWalletAddrs);

  const { txPerMinute, whaleCount } = useMemo(() => {
    const now = Date.now();
    return {
      txPerMinute: transactions.filter((tx) => now - new Date(tx.timestamp).getTime() <= 60000).length,
      whaleCount: transactions.filter((tx) => isWhaleTx(tx, tokenPriceUsd)).length
    };
  }, [transactions, tokenPriceUsd]);

  return (
    <div className="rounded-xl border border-[#2a2f36] overflow-hidden">
      <div className="px-3 py-2.5 bg-[#0E1318] border-b border-[#2a2f36] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
          <span>
            Speed: <span className="text-gray-200 font-semibold">{txPerMinute}</span> tx/min
          </span>
          {Number(tokenPriceUsd) > 0 ? (
            <span className="text-[10px] text-gray-600">
              Whale ≥ ${formatUsdWhole(WHALE_USD_MIN)} notional
            </span>
          ) : null}
          {whaleCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-200/90 text-[11px] font-semibold">
              <Sparkles size={12} />
              {whaleCount} whale{whaleCount === 1 ? "" : "s"} in view
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => toast("Whale alerts — coming soon.")}
          className="text-xs text-purple-300 hover:text-purple-200 inline-flex items-center gap-1 shrink-0"
        >
          <Bell size={12} />
          Alert on whale
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <div className="hidden md:grid grid-cols-[92px_1fr_110px_88px_70px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 bg-[#0E1318]">
          <span>Type</span>
          <span>Wallet</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Time</span>
          <span className="text-right">View</span>
        </div>
        {transactions.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-8">Waiting for swaps…</div>
        )}
        {transactions.map((tx, idx) => {
          const whale = isWhaleTx(tx, tokenPriceUsd);
          const wAddr = tx.wallet || tx.trader || tx.from;
          const walletLine =
            wAddr && wAddr.length >= 32 && wAddr.length <= 44 ? labelFor(wAddr) : shortWallet(wAddr);
          const walletTitle =
            wAddr && wAddr.length >= 32 && wAddr.length <= 44 ? titleFor(wAddr) : wAddr || "";
          return (
            <div
              key={tx.signature || `${tx.wallet}-${tx.timestamp}-${idx}`}
              className={`${idx % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"} ${whale ? "ring-1 ring-inset ring-amber-500/20 bg-amber-500/[0.04]" : ""} ${tx.shouldNotify ? "glow-animation" : ""}`}
            >
              <div className="hidden md:grid grid-cols-[92px_1fr_110px_88px_70px] gap-2 px-3 py-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span
                    className={`w-fit text-xs font-bold px-2 py-0.5 rounded-full ${
                      tx.type === "buy"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : tx.type === "swap"
                          ? "bg-amber-500/15 text-amber-200"
                          : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {tx.type === "buy" ? (
                        <ArrowUp size={11} />
                      ) : tx.type === "swap" ? (
                        <ArrowUp size={11} className="rotate-45 text-amber-200" />
                      ) : (
                        <ArrowDown size={11} />
                      )}
                      {tx.type === "buy" ? "BUY" : tx.type === "swap" ? "SWAP" : "SELL"}
                    </span>
                  </span>
                  {whale ? (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-amber-200/90 inline-flex items-center gap-0.5">
                      <Sparkles size={10} />
                      Whale
                    </span>
                  ) : null}
                  {tx.isMock ? (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-cyan-200/90">🔬 Simulated</span>
                  ) : null}
                </div>
                <span className="mono text-gray-300 self-center truncate min-w-0" title={walletTitle}>
                  {walletLine}
                </span>
                <span className="text-right mono self-center">{Number(tx.amount || 0).toFixed(2)}</span>
                <span className="text-gray-500 text-xs text-right self-center">{formatTime(tx.timestamp)}</span>
                <a
                  href={tx.signature ? `https://solscan.io/tx/${tx.signature}` : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`text-right inline-flex justify-end items-center self-center ${tx.signature ? "text-blue-300 hover:text-blue-200" : "text-gray-600 pointer-events-none"}`}
                >
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="md:hidden px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-fit text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        tx.type === "buy"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : tx.type === "swap"
                            ? "bg-amber-500/15 text-amber-200"
                            : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {tx.type === "buy" ? "BUY" : tx.type === "swap" ? "SWAP" : "SELL"}
                    </span>
                    {whale ? (
                      <span className="text-[9px] font-bold uppercase text-amber-200/90 inline-flex items-center gap-0.5">
                        <Sparkles size={10} />
                        Whale
                      </span>
                    ) : null}
                    {tx.isMock ? <span className="text-[9px] font-bold uppercase text-cyan-200/90">🔬 Simulated</span> : null}
                  </div>
                  <span className="text-[11px] text-gray-500">{formatTime(tx.timestamp)}</span>
                </div>
                <div className="text-xs mono text-gray-300 truncate" title={walletTitle}>
                  {walletLine}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm mono">{Number(tx.amount || 0).toFixed(2)} tokens</span>
                  <a
                    href={tx.signature ? `https://solscan.io/tx/${tx.signature}` : "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-blue-300 text-xs ${tx.signature ? "" : "pointer-events-none text-gray-600"}`}
                  >
                    Solscan
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
