/**
 * InstitutionalProse — long-form text container (legal, privacy, terms, docs).
 *
 * Provides controlled vertical rhythm, bullet styles, h2/h3 typography and a
 * comfortable max-width. Wrap raw paragraphs / lists in this component to
 * inherit the Phase-7 reading style without ad-hoc Tailwind on every line.
 *
 * Use h2/h3 as section headers (rendered tight + tracked uppercase eyebrow).
 */
export function InstitutionalProse({ children, className = "" }) {
  return (
    <div className={`sl-inst-prose ${className}`.trim()}>
      {children}
      <style jsx global>{`
        .sl-inst-prose {
          color: var(--sl-text-secondary);
          font-size: 14px;
          line-height: 1.65;
        }
        .sl-inst-prose > * + * {
          margin-top: 14px;
        }
        .sl-inst-prose strong {
          color: var(--sl-text-primary);
          font-weight: 600;
        }
        .sl-inst-prose a {
          color: var(--sl-text-accent);
          text-decoration: none;
          border-bottom: 1px dotted rgba(167, 139, 250, 0.4);
          transition: border-color 150ms;
        }
        .sl-inst-prose a:hover {
          border-bottom-color: var(--sl-text-accent);
        }
        .sl-inst-prose h2 {
          color: var(--sl-text-primary);
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -0.005em;
          margin-top: 28px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .sl-inst-prose h3 {
          color: var(--sl-text-primary);
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin-top: 18px;
        }
        .sl-inst-prose ul,
        .sl-inst-prose ol {
          padding-left: 18px;
        }
        .sl-inst-prose li {
          margin-top: 6px;
        }
        .sl-inst-prose ul > li {
          list-style-type: square;
          list-style-position: outside;
        }
        .sl-inst-prose ol > li {
          list-style-type: decimal;
          list-style-position: outside;
        }
        .sl-inst-prose code {
          font-family: var(--sl-font-mono);
          font-size: 12px;
          padding: 1px 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
      `}</style>
    </div>
  );
}
