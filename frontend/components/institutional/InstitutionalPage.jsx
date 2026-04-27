import { PageHead } from "../seo/PageHead";

/**
 * Institutional page wrapper — Phase 7 design language.
 *
 * Visual model: Nansen / Arkham institutional surfaces.
 *  - Top accent line (1px gradient) — signals "operating environment".
 *  - Tracker label (mono uppercase, tracked) — signals "page identity".
 *  - Title (sans, tight) — signals "subject".
 *  - Optional subtitle (muted, max-2xl).
 *  - Optional actions row on the right (right-aligned at desktop).
 *
 * Use this as the OUTER frame for every page so all surfaces share one
 * vertical rhythm and reading width. Internals: free-form children, but
 * prefer InstitutionalSection / InstitutionalCard / InstitutionalProse.
 *
 * Props:
 *  - trackerLabel: short uppercase tag, e.g. "LEGAL", "PRICING".
 *  - title: page title. Plain string (no markup).
 *  - subtitle: optional one-liner.
 *  - actions: optional right-side React node (buttons, status pill, etc.).
 *  - pageHeadTitle, pageHeadDescription: forwarded to PageHead (SEO).
 *  - width: "default" (max-w-4xl) | "wide" (max-w-6xl) | "narrow" (max-w-3xl).
 *  - children: page body.
 */
export function InstitutionalPage({
  trackerLabel,
  title,
  subtitle,
  actions,
  pageHeadTitle,
  pageHeadDescription,
  width = "default",
  children
}) {
  const widthClass =
    width === "wide" ? "max-w-6xl" : width === "narrow" ? "max-w-3xl" : "max-w-4xl";
  return (
    <>
      <PageHead title={pageHeadTitle || title} description={pageHeadDescription || subtitle || title} />
      <div className="sl-inst-page-accent" aria-hidden />
      <div className={`mx-auto px-4 sm:px-6 ${widthClass} pt-8 sm:pt-10 pb-16 space-y-8`}>
        <header className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="space-y-2 min-w-0">
              {trackerLabel ? (
                <div className="flex items-center gap-2 text-[10px] font-mono font-semibold uppercase tracking-[0.22em] text-[var(--sl-text-muted)]">
                  <span className="sl-inst-tracker-dot" aria-hidden />
                  <span>{trackerLabel}</span>
                </div>
              ) : null}
              <h1 className="font-display text-2xl sm:text-[28px] font-bold text-[var(--sl-text-primary)] tracking-tight leading-[1.15]">
                {title}
              </h1>
              {subtitle ? (
                <p className="text-sm text-[var(--sl-text-secondary)] max-w-2xl leading-relaxed">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
          </div>
          <div className="sl-inst-divider" aria-hidden />
        </header>
        <div className="space-y-6">{children}</div>
      </div>
      <style jsx global>{`
        /* Apex Obsidian: top accent line — pearl silver flanks, gold center. */
        .sl-inst-page-accent {
          position: relative;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(209, 213, 219, 0.20) 18%,
            rgba(245, 158, 11, 0.45) 50%,
            rgba(209, 213, 219, 0.20) 82%,
            transparent
          );
        }
        /* Apex Obsidian: tracker dot — gold pulse instead of soft violet. */
        .sl-inst-tracker-dot {
          width: 6px;
          height: 6px;
          background: #fbbf24;
          border-radius: 999px;
          box-shadow: 0 0 8px rgba(245, 158, 11, 0.55);
          display: inline-block;
        }
        .sl-inst-divider {
          height: 1px;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.08),
            rgba(255, 255, 255, 0.02) 65%,
            transparent
          );
        }
      `}</style>
    </>
  );
}
