import { tokenStateChipClass, tokenStateChipLabel } from "@/lib/tokenStateChip.mjs";

export function TokenStateChip({ state, className = "" }) {
  const label = tokenStateChipLabel(state);
  if (!label) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${tokenStateChipClass(
        state
      )} ${className}`.trim()}
    >
      {label}
    </span>
  );
}
