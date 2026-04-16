import { ArrowDown, ArrowUp, ExternalLink, Bell } from "lucide-react";
import toast from "react-hot-toast";

function shortWallet(wallet = "") {
  if (!wallet) return "unknown";
  return `${wallet.slice(0, 5)}...${wallet.slice(-4)}`;
}

export function LiveFlowPanel({ transactions = [] }) {
  const now = Date.now();
  const txPerMinute = transactions.filter((tx) => now - new Date(tx.timestamp).getTime() <= 60000).length;

  return (
    <div className="rounded-xl border soft-divider overflow-hidden">
      <div className="px-3 py-2 bg-[#0E1318] border-b soft-divider flex items-center justify-between">
        <span className="text-xs text-gray-400">Speed: {txPerMinute} tx/min</span>
        <button
          onClick={() => toast("Whale alert saved (coming soon).")}
          className="text-xs text-purple-300 hover:text-purple-200 inline-flex items-center gap-1"
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
        <div className="text-gray-500 text-sm text-center py-6">Waiting for swaps...</div>
      )}
      {transactions.map((tx, idx) => (
        <div key={idx} className={`${idx % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"}`}>
          <div
            className="hidden md:grid grid-cols-[92px_1fr_110px_88px_70px] gap-2 px-3 py-2 text-sm"
          >
            <span
              className={`w-fit text-xs font-bold px-2 py-0.5 rounded-full ${
                tx.type === "buy" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                {tx.type === "buy" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                {tx.type === "buy" ? "BUY" : "SELL"}
              </span>
            </span>
            <span className="mono text-gray-300">{shortWallet(tx.wallet || tx.trader || tx.from)}</span>
            <span className="text-right mono">{Number(tx.amount || 0).toFixed(2)}</span>
            <span className="text-gray-500 text-xs text-right">
              {new Date(tx.timestamp).toLocaleTimeString()}
            </span>
            <a
              href={tx.signature ? `https://solscan.io/tx/${tx.signature}` : "#"}
              target="_blank"
              rel="noreferrer"
              className={`text-right inline-flex justify-end items-center ${tx.signature ? "text-blue-300 hover:text-blue-200" : "text-gray-600 pointer-events-none"}`}
            >
              <ExternalLink size={14} />
            </a>
          </div>

          <div className="md:hidden px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span
                className={`w-fit text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  tx.type === "buy" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
                }`}
              >
                {tx.type === "buy" ? "BUY" : "SELL"}
              </span>
              <span className="text-[11px] text-gray-500">{new Date(tx.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="text-xs mono text-gray-300">{shortWallet(tx.wallet || tx.trader || tx.from)}</div>
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
      ))}
      </div>
    </div>
  );
}

