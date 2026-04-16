import { GradeBadge } from "./GradeBadge";
import { CheckCircle2, XCircle } from "lucide-react";

function CircularConfidence({ value }) {
  const normalized = Math.max(0, Math.min(100, Number(value || 0)));
  const deg = (normalized / 100) * 360;
  return (
    <div
      className="relative w-16 h-16 rounded-full"
      style={{ background: `conic-gradient(#8b5cf6 ${deg}deg, #2a2f36 ${deg}deg)` }}
    >
      <div className="absolute inset-[4px] rounded-full bg-[#13171A] flex items-center justify-center text-xs font-bold">
        {normalized}%
      </div>
    </div>
  );
}

function gradeBorderClass(grade) {
  if (grade === "A+" || grade === "A" || grade === "B") return "border-l-emerald-400";
  if (grade === "C" || grade === "D") return "border-l-amber-400";
  return "border-l-red-400";
}

export function DecisionPanel({ analysis }) {
  if (!analysis) return <div className="glass-card p-6 skeleton-shimmer h-40" />;
  const { grade, confidence, pros, cons } = analysis;

  return (
    <div className={`glass-card p-6 border-l-4 ${gradeBorderClass(grade)} bg-gradient-to-br from-white/[0.03] to-transparent`}>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-5">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          Sentinel Decision
        </h2>
        <div className="flex items-center gap-3">
          <CircularConfidence value={confidence} />
          <GradeBadge grade={grade} confidence={confidence} />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {pros?.length > 0 && (
          <div>
            <div className="text-green-400 font-semibold mb-2 flex items-center gap-2">
              <CheckCircle2 size={16} />
              Pros
            </div>
            <ul className="space-y-1">
              {pros.map((pro, i) => (
                <li key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-green-400">✓</span> {pro}
                </li>
              ))}
            </ul>
          </div>
        )}
        {cons?.length > 0 && (
          <div>
            <div className="text-red-400 font-semibold mb-2 flex items-center gap-2">
              <XCircle size={16} />
              Cons
            </div>
            <ul className="space-y-1">
              {cons.map((con, i) => (
                <li key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-red-400">✗</span> {con}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

