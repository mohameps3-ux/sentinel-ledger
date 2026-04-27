/**
 * InstitutionalKPI — single KPI tile (label + big mono number + optional delta).
 *
 * Use inside an InstitutionalKPIRow grid for clean Bloomberg-style strips.
 *
 * Props:
 *  - label: short uppercase label (auto-styled)
 *  - value: pre-formatted string ("12.4%", "$1.4M", "—", "Accumulating"...)
 *           Always pre-format; this component does not do arithmetic.
 *  - delta: optional pre-formatted delta string ("+0.8pt"); auto-toned by `deltaTone`.
 *  - deltaTone: "win" | "loss" | "neutral" (default "neutral")
 *  - hint: small explanation under the value
 *  - tone: outer tile tone — "default" | "accent" | "warn" | "loss"
 */
export function InstitutionalKPI({ label, value, delta, deltaTone = "neutral", hint, tone = "default" }) {
  const toneClass =
    tone === "accent"
      ? "sl-inst-kpi--accent"
      : tone === "warn"
        ? "sl-inst-kpi--warn"
        : tone === "loss"
          ? "sl-inst-kpi--loss"
          : "";
  const deltaToneClass =
    deltaTone === "win"
      ? "text-[var(--sl-win,#10b981)]"
      : deltaTone === "loss"
        ? "text-[var(--sl-loss,#ef4444)]"
        : "text-[var(--sl-text-muted)]";
  return (
    <div className={`sl-inst-kpi ${toneClass}`.trim()}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-[var(--sl-text-muted)]">
          {label}
        </p>
        {delta ? (
          <span className={`text-[11px] font-mono font-semibold tabular-nums ${deltaToneClass}`}>
            {delta}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 font-mono text-[22px] font-bold tabular-nums text-[var(--sl-text-primary)] leading-tight tracking-tight">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--sl-text-muted)] leading-snug">{hint}</p> : null}
      <style jsx global>{`
        .sl-inst-kpi {
          padding: 14px 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 50%),
            rgba(13, 14, 26, 0.85);
        }
        /* Apex Obsidian: accent KPI — gold border + warm wash for value markers. */
        .sl-inst-kpi--accent {
          border-color: rgba(250, 204, 21, 0.32);
          background:
            linear-gradient(180deg, rgba(250, 204, 21, 0.06), transparent 50%),
            rgba(13, 14, 26, 0.9);
        }
        .sl-inst-kpi--warn {
          border-color: rgba(250, 204, 21, 0.28);
        }
        .sl-inst-kpi--loss {
          border-color: rgba(239, 68, 68, 0.28);
        }
      `}</style>
    </div>
  );
}

/**
 * InstitutionalKPIRow — grid wrapper for InstitutionalKPI tiles.
 * Defaults to 2/4 columns (mobile/desktop). Pass `cols` to override.
 */
export function InstitutionalKPIRow({ children, cols }) {
  const colClass = cols
    ? cols === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : cols === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : cols === 4
          ? "grid-cols-2 lg:grid-cols-4"
          : "grid-cols-2 lg:grid-cols-5"
    : "grid-cols-2 lg:grid-cols-4";
  return <div className={`grid gap-2 ${colClass}`}>{children}</div>;
}
