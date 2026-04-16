import { ExternalLink } from "lucide-react";

function shortWallet(wallet = "") {
  if (!wallet) return "unknown";
  return `${wallet.slice(0, 5)}...${wallet.slice(-4)}`;
}

export function LiveFlowPanel({ transactions = [] }) {
  return (
    <div className="max-h-96 overflow-y-auto rounded-xl border soft-divider">
      <div className="grid grid-cols-[92px_1fr_110px_88px_70px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 bg-[#0E1318]">
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
        <div
          key={idx}
          className={`grid grid-cols-[92px_1fr_110px_88px_70px] gap-2 px-3 py-2 text-sm ${
            idx % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
          }`}
        >
          <span
            className={`w-fit text-xs font-bold px-2 py-0.5 rounded-full ${
              tx.type === "buy" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
            }`}
          >
            {tx.type === "buy" ? "BUY" : "SELL"}
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
      ))}
    </div>
  );
}

