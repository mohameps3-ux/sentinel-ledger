import { AlertTriangle, CheckCircle2, Compass, Shield, Users } from "lucide-react";

function verdictFromAnalysis(analysis) {
  const confidence = Number(analysis?.confidence || 0);
  if (confidence >= 90) return { label: "High Conviction", tone: "text-emerald-300", chip: "bg-emerald-500/15 border-emerald-500/30" };
  if (confidence >= 75) return { label: "Watchlist Candidate", tone: "text-amber-300", chip: "bg-amber-500/15 border-amber-500/30" };
  return { label: "High Caution", tone: "text-red-300", chip: "bg-red-500/15 border-red-500/30" };
}

export function TradeReadinessPanel({ analysis, market, holders, deployer }) {
  if (!analysis) return null;
  const verdict = verdictFromAnalysis(analysis);
  const topHolderRisk = Number(holders?.top10Percentage || 0) > 40;
  const deployerRisk = Number(deployer?.riskScore || 0) > 70;
  const hasLiquidity = Number(market?.liquidity || 0) >= 10000;

  const checks = [
    {
      id: "liquidity",
      icon: Shield,
      label: "Liquidity floor",
      pass: hasLiquidity,
      detail: hasLiquidity ? "Sufficient depth for entries." : "Thin liquidity, slippage risk."
    },
    {
      id: "holders",
      icon: Users,
      label: "Holder concentration",
      pass: !topHolderRisk,
      detail: topHolderRisk ? "Top wallets are too concentrated." : "Distribution looks healthier."
    },
    {
      id: "deployer",
      icon: Compass,
      label: "Deployer profile",
      pass: !deployerRisk,
      detail: deployerRisk ? "Elevated deployer risk score." : "No critical deployer red flags."
    }
  ];

  return (
    <section className="glass-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm uppercase tracking-wide text-gray-400">Trade Readiness</h3>
        <span className={`text-xs px-2.5 py-1 rounded-full border ${verdict.chip} ${verdict.tone}`}>
          {verdict.label}
        </span>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {checks.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="bg-[#0E1318] border soft-divider rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <Icon size={14} className="text-gray-400" />
                  {item.label}
                </div>
                {item.pass ? (
                  <CheckCircle2 size={15} className="text-emerald-300" />
                ) : (
                  <AlertTriangle size={15} className="text-red-300" />
                )}
              </div>
              <p className={`text-xs ${item.pass ? "text-gray-400" : "text-red-300"}`}>{item.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

