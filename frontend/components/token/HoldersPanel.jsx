import { formatInteger } from "../../lib/formatStable";

export function HoldersPanel({ holders }) {
  const data = holders || null;
  const hasData =
    data &&
    typeof data.top10Percentage === "number" &&
    typeof data.totalHolders === "number" &&
    (data.top10Percentage > 0 || data.totalHolders > 0);

  if (!hasData) {
    return (
      <div className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl p-4 text-center">
        Data not available
      </div>
    );
  }

  const fromBirdeye = data.holderCountSource === "birdeye";
  const sampled = data.largestAccountsSampled > 0 ? data.largestAccountsSampled : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <span className="text-gray-400 text-sm" title="Share of supply controlled by top 10 wallets.">
          Top 10 concentration
        </span>
        <span className={`font-mono text-sm font-semibold ${data.top10Percentage > 40 ? "text-red-400" : "text-emerald-400"}`}>
          {data.top10Percentage.toFixed(1)}%
        </span>
      </div>
      <div className="flex justify-between items-start gap-3">
        <div>
          <span className="text-gray-400 text-sm block">Total holders</span>
          {sampled != null ? (
            <span className="text-[10px] text-gray-600 block mt-0.5">
              RPC sampled {sampled} largest accounts
            </span>
          ) : null}
        </div>
        <div className="text-right">
          {data.totalHolders > 0 ? (
            <>
              <span className="font-mono text-sm font-semibold text-white">{formatInteger(data.totalHolders)}</span>
              {fromBirdeye ? (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-300/90">Birdeye</span>
              ) : null}
            </>
          ) : (
            <div className="text-right max-w-[200px]">
              <span className="text-gray-500 font-mono">—</span>
              <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                Set <span className="mono text-gray-500">BIRDEYE_API_KEY</span> on the API for aggregate holder count.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="w-full bg-gray-800/80 rounded-full h-2 overflow-hidden">
        <div
          className="bg-purple-500 h-full rounded-full transition-all"
          style={{ width: `${Math.min(data.top10Percentage, 100)}%` }}
        />
      </div>
      <div className="space-y-2 pt-1">
        <div className="text-xs text-gray-500">Risk visualization</div>
        <div className="h-2 rounded-full bg-[#0E1318] overflow-hidden border border-[#2a2f36]">
          <div
            className={`h-full ${data.top10Percentage > 40 ? "bg-red-500" : data.top10Percentage > 25 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(data.top10Percentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
