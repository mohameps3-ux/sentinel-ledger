import { buildSolscanAccountUrl, EXTERNAL_ANCHOR_REL } from "../../lib/terminalLinks";

export function DeployerPanel({ deployer }) {
  if (!deployer) {
    return (
      <div className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl p-4 text-center">
        Data not available
      </div>
    );
  }

  const riskColor =
    deployer.riskScore > 70
      ? "text-red-400"
      : deployer.riskScore > 40
        ? "text-yellow-400"
        : "text-green-400";
  const risk = Math.min(Math.max(Number(deployer.riskScore || 0), 0), 100);
  const circ = (risk / 100) * 360;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div
          className="relative w-14 h-14 rounded-full"
          style={{ background: `conic-gradient(#8b5cf6 ${circ}deg, #2a2f36 ${circ}deg)` }}
        >
          <div className="absolute inset-[4px] rounded-full bg-[#13171A] flex items-center justify-center text-[10px] font-bold">
            {risk}
          </div>
        </div>
        {deployer.address ? (
          <a
            href={buildSolscanAccountUrl(deployer.address)}
            target="_blank"
            rel={EXTERNAL_ANCHOR_REL}
            className="text-xs text-blue-300 hover:text-blue-200"
          >
            View on Solscan
          </a>
        ) : null}
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Address</span>
        <span className="font-mono" title={deployer.address}>
          {deployer.address?.slice(0, 6)}...{deployer.address?.slice(-4)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400" title="Total token launches attributed to this deployer.">
          Total launches
        </span>
        <span>{deployer.totalLaunches}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400" title="Known suspicious launches linked to this deployer.">
          Suspicious rugs
        </span>
        <span className="text-red-400">{deployer.rugCount}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Label</span>
        <span className="text-violet-300">{deployer.deployerLabel || "First Launch"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Success rate</span>
        <span className="text-emerald-300">{Number(deployer.successRate || 0).toFixed(1)}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Avg time to rug</span>
        <span>{deployer.averageHoursToRug != null ? `${Number(deployer.averageHoursToRug).toFixed(1)}h` : "N/A"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400" title="Composite deployer risk score from Sentinel.">
          Risk score
        </span>
        <span className={riskColor}>{deployer.riskScore}/100</span>
      </div>
      <div className="pt-1">
        <div className="h-2 rounded-full bg-[#0E1318] overflow-hidden border soft-divider">
          <div
            className={`h-full ${deployer.riskScore > 70 ? "bg-red-500" : deployer.riskScore > 40 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(Math.max(Number(deployer.riskScore || 0), 0), 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

