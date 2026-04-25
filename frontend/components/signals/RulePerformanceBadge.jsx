function toneClass(perf) {
  if (!perf?.hasSample) return "border-white/10 bg-white/[0.03] text-gray-400";
  const c = Number(perf.confidenceScore || 0);
  if (c > 0.7) return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (c >= 0.5) return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-white/10 bg-white/[0.03] text-gray-400";
}

export function RulePerformanceBadge({ performance, compact = false }) {
  if (!performance?.ruleId) return null;
  const avg = Math.round(Number(performance.avgReturn60m || 0) * 100);
  const label = performance.hasSample
    ? `${performance.ruleId} · ${Math.round(Number(performance.confidenceScore || 0) * 100)}% · ${
        avg >= 0 ? "+" : ""
      }${avg}% avg${performance.regimeContext ? ` · ⚠ ${performance.regimeContext}` : ""}`
    : `${performance.ruleId} · New rule — building track record`;
  return (
    <span
      className={`inline-flex max-w-full items-center rounded border px-1 py-0.5 font-mono leading-tight ${toneClass(
        performance
      )} ${compact ? "text-[8px]" : "text-[9px]"}`}
      title={label}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
