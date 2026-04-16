export function DeployerPanel({ deployer }) {
  if (!deployer)
    return (
      <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
        <h3 className="text-lg font-bold mb-3">🔍 Deployer Info</h3>
        <div className="text-gray-500">Loading deployer data...</div>
      </div>
    );
  const riskColor =
    deployer.riskScore > 70
      ? "text-red-400"
      : deployer.riskScore > 40
        ? "text-yellow-400"
        : "text-green-400";
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      <h3 className="text-lg font-bold mb-3">🔍 Deployer History</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Address</span>
          <span className="font-mono text-gray-300">
            {deployer.address?.slice(0, 6)}...{deployer.address?.slice(-4)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Total launches</span>
          <span>{deployer.totalLaunches}</span>
        </div>
        <div className="flex justify-between">
          <span>Suspicious rugs</span>
          <span>{deployer.rugCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Risk score</span>
          <span className={riskColor}>{deployer.riskScore}/100</span>
        </div>
      </div>
    </div>
  );
}

