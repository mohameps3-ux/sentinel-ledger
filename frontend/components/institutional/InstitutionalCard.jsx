/**
 * InstitutionalCard — surface container with optional title bar.
 *
 * Visual: 1px white-08 border, dark gradient surface, no rounded corners
 * by default (Nansen/Arkham-style). Use `padded={false}` when you embed
 * a table that brings its own padding.
 *
 * Tones:
 *  - "default" — neutral
 *  - "accent"  — subtle gold border (Apex Obsidian — use for primary KPIs)
 *  - "warn"    — amber border (use for warnings / disclaimers)
 *  - "loss"    — red border (use for risk surfaces)
 */
export function InstitutionalCard({
  title,
  trackerLabel,
  actions,
  tone = "default",
  padded = true,
  className = "",
  children
}) {
  const toneClass =
    tone === "accent"
      ? "sl-inst-card--accent"
      : tone === "warn"
        ? "sl-inst-card--warn"
        : tone === "loss"
          ? "sl-inst-card--loss"
          : "";
  const hasHead = Boolean(title || trackerLabel || actions);
  return (
    <div className={`sl-inst-card ${toneClass} ${className}`.trim()}>
      {hasHead ? (
        <div className="sl-inst-card__head">
          <div className="space-y-0.5 min-w-0">
            {trackerLabel ? (
              <p className="text-[9px] font-mono font-semibold uppercase tracking-[0.22em] text-[var(--sl-text-muted)]">
                {trackerLabel}
              </p>
            ) : null}
            {title ? (
              <p className="text-[13px] font-semibold text-[var(--sl-text-primary)] tracking-tight">
                {title}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? "sl-inst-card__body" : ""}>{children}</div>
      <style jsx global>{`
        .sl-inst-card {
          position: relative;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 38%),
            rgba(13, 14, 26, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        /* Apex Obsidian: accent tone — gold border + warm wash. */
        .sl-inst-card--accent {
          border-color: rgba(245, 158, 11, 0.32);
          background:
            linear-gradient(180deg, rgba(245, 158, 11, 0.06), transparent 42%),
            rgba(13, 14, 26, 0.92);
        }
        .sl-inst-card--warn {
          border-color: rgba(245, 158, 11, 0.32);
          background:
            linear-gradient(180deg, rgba(245, 158, 11, 0.04), transparent 42%),
            rgba(13, 14, 26, 0.9);
        }
        .sl-inst-card--loss {
          border-color: rgba(239, 68, 68, 0.32);
          background:
            linear-gradient(180deg, rgba(239, 68, 68, 0.04), transparent 42%),
            rgba(13, 14, 26, 0.9);
        }
        .sl-inst-card__head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .sl-inst-card__body {
          padding: 16px;
        }
      `}</style>
    </div>
  );
}
