import { buildSolscanAccountUrl, EXTERNAL_ANCHOR_REL } from "../../lib/terminalLinks";

export function DeployerPanel({ deployer, tokenMint }) {
  if (!deployer) {
    return (
      <div className="border border-dashed border-[#2a2f36] p-4 space-y-3">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Deployer address not indexed by DexScreener for this token.
          Check on-chain directly:
        </p>
        {tokenMint ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={buildSolscanAccountUrl(tokenMint)}
              target="_blank"
              rel={EXTERNAL_ANCHOR_REL}
              className="text-[11px] text-blue-300 hover:text-blue-200 border border-blue-500/25 bg-blue-500/[0.06] px-2.5 py-1.5 inline-flex items-center gap-1"
            >
              Solscan →
            </a>
            <a
              href={`https://pump.fun/coin/${tokenMint}`}
              target="_blank"
              rel={EXTERNAL_ANCHOR_REL}
              className="text-[11px] text-fuchsia-300 hover:text-fuchsia-200 border border-fuchsia-500/25 bg-fuchsia-500/[0.06] px-2.5 py-1.5 inline-flex items-center gap-1"
            >
              pump.fun →
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  if (deployer.noHistory) {
    return (
      <div className="space-y-3">
        <div className="border border-dashed border-[#2a2f36] px-3 py-2.5 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">
            {deployer.deployerLabel || "First Launch"}
          </p>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            No previous launches found in Sentinel&apos;s deployer history. This may be a new or anonymous deployer.
          </p>
        </div>
        {deployer.address ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-600 font-semibold">Deployer address</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-gray-300">
                {deployer.address.slice(0, 8)}…{deployer.address.slice(-6)}
              </span>
              <a
                href={buildSolscanAccountUrl(deployer.address)}
                target="_blank"
                rel={EXTERNAL_ANCHOR_REL}
                className="text-[11px] text-blue-300 hover:text-blue-200 shrink-0"
              >
                Solscan →
              </a>
            </div>
          </div>
        ) : null}
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

