/**
 * Shared rank indicators for tactical lists.
 */
export function RankBadge({ rank }) {
  if (!Number.isFinite(rank) || rank < 1) return null;
  const base =
    "shrink-0 inline-flex items-center justify-center font-mono tabular-nums text-[9px] leading-none font-bold rounded border px-1 py-0.5";
  const tone =
    rank === 1
      ? "bg-yellow-500/15 text-yellow-200 border-yellow-500/40 shadow-[0_0_10px_rgba(234,179,8,0.25)]"
      : rank === 2
        ? "bg-slate-300/10 text-slate-100 border-slate-300/30"
        : rank === 3
          ? "bg-orange-500/15 text-orange-200 border-orange-500/30"
          : "bg-white/[0.03] text-gray-400 border-white/10";
  return (
    <span className={`${base} ${tone}`} title={`Rank #${rank}`}>
      #{rank}
    </span>
  );
}

export function RankDeltaChip({ delta, isNew }) {
  if (isNew) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[9px] leading-none font-bold uppercase tracking-wider px-1 py-0.5 rounded border border-violet-500/40 bg-violet-500/15 text-violet-200"
        title="New entry in the ranking"
      >
        NEW
      </span>
    );
  }
  if (!Number.isFinite(delta) || delta === 0) return null;
  const up = delta > 0;
  const n = Math.abs(delta);
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] leading-none font-bold font-mono tabular-nums px-1 py-0.5 rounded border ${
        up
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/40 bg-red-500/10 text-red-300"
      }`}
      title={up ? `Up ${n} position${n === 1 ? "" : "s"}` : `Down ${n} position${n === 1 ? "" : "s"}`}
    >
      {up ? "▲" : "▼"}
      {n}
    </span>
  );
}
