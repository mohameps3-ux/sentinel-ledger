/**
 * InstitutionalSection — block-level section with optional header rail.
 *
 * Two variants:
 *  - "rail"  (default): thin purple/cyan accent line at the top of the
 *    section + tracker label + optional description. Reads as a "tab" in
 *    a Bloomberg / Nansen page layout.
 *  - "plain": no rail, just spacing. Use for the first section after page
 *    header or when content is decorative-light.
 *
 * Always renders inside an InstitutionalPage. Avoid nesting Sections.
 */
export function InstitutionalSection({
  trackerLabel,
  title,
  description,
  actions,
  variant = "rail",
  className = "",
  children
}) {
  return (
    <section className={`sl-inst-section ${variant === "rail" ? "sl-inst-section--rail" : ""} ${className}`.trim()}>
      {(trackerLabel || title || description || actions) ? (
        <div className="sl-inst-section__head">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="space-y-1.5 min-w-0">
              {trackerLabel ? (
                <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.22em] text-[var(--sl-text-muted)]">
                  {trackerLabel}
                </p>
              ) : null}
              {title ? (
                <h2 className="font-display text-lg sm:text-xl font-semibold text-[var(--sl-text-primary)] tracking-tight">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="text-[13px] text-[var(--sl-text-secondary)] max-w-2xl leading-relaxed">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
          </div>
        </div>
      ) : null}
      <div className="sl-inst-section__body">{children}</div>
      <style jsx global>{`
        .sl-inst-section {
          position: relative;
        }
        .sl-inst-section--rail {
          padding-top: 14px;
        }
        /* Apex Obsidian: section rail — gold left edge fading to nothing. */
        .sl-inst-section--rail::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(
            90deg,
            rgba(245, 158, 11, 0.55),
            rgba(209, 213, 219, 0.15) 35%,
            transparent
          );
        }
        .sl-inst-section__head {
          margin-bottom: 14px;
        }
        .sl-inst-section__body {
          /* let children control their own padding */
        }
      `}</style>
    </section>
  );
}
