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

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <span className="text-gray-400">Address</span>
        <span className="font-mono">
          {deployer.address?.slice(0, 6)}...{deployer.address?.slice(-4)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Total launches</span>
        <span>{deployer.totalLaunches}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Suspicious rugs</span>
        <span className="text-red-400">{deployer.rugCount}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Risk score</span>
        <span className={riskColor}>{deployer.riskScore}/100</span>
      </div>
    </div>
  );
}

