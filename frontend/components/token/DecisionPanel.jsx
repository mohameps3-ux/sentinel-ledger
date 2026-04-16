import { GradeBadge } from "./GradeBadge";

export function DecisionPanel({ analysis }) {
  if (!analysis) return <div className="glass-card p-6 animate-pulse h-32" />;
  const { grade, confidence, pros, cons } = analysis;

  return (
    <div className="glass-card p-6">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          🧠 Sentinel Decision
        </h2>
        <GradeBadge grade={grade} confidence={confidence} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {pros?.length > 0 && (
          <div>
            <div className="text-green-400 font-semibold mb-2 flex items-center gap-1">
              ✓ Pros
            </div>
            <ul className="space-y-1">
              {pros.map((pro, i) => (
                <li key={i} className="text-sm text-gray-300">
                  + {pro}
                </li>
              ))}
            </ul>
          </div>
        )}
        {cons?.length > 0 && (
          <div>
            <div className="text-red-400 font-semibold mb-2 flex items-center gap-1">
              ⚠️ Cons
            </div>
            <ul className="space-y-1">
              {cons.map((con, i) => (
                <li key={i} className="text-sm text-gray-300">
                  - {con}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

