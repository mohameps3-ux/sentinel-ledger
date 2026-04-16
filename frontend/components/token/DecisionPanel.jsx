import { GradeBadge } from "./GradeBadge";

export function DecisionPanel({ analysis }) {
  if (!analysis) return <div className="animate-pulse h-32 bg-gray-800 rounded-2xl" />;
  const { grade, confidence, pros, cons } = analysis;
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">🧠 Sentinel Decision</h3>
          <GradeBadge grade={grade} confidence={confidence} />
        </div>
      </div>
      {pros?.length > 0 && (
        <div className="mb-3">
          <div className="text-sm text-gray-400 mb-1">✓ Pros</div>
          {pros.map((pro, i) => (
            <div key={i} className="text-green-400 text-sm">
              + {pro}
            </div>
          ))}
        </div>
      )}
      {cons?.length > 0 && (
        <div>
          <div className="text-sm text-gray-400 mb-1">⚠️ Cons</div>
          {cons.map((con, i) => (
            <div key={i} className="text-red-400 text-sm">
              - {con}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

