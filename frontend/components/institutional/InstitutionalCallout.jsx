/**
 * InstitutionalCallout — colored boxed message (info / warn / danger / success).
 *
 * Use for advisory text inside Sections (e.g. policy notes, compliance hints).
 * No icons by default — pass `icon` if you want one (lucide-react node).
 */
export function InstitutionalCallout({ tone = "info", title, icon, children }) {
  const palette = {
    info: {
      border: "rgba(99, 102, 241, 0.32)",
      bg: "rgba(99, 102, 241, 0.05)",
      title: "var(--sl-text-accent)"
    },
    warn: {
      border: "rgba(245, 158, 11, 0.32)",
      bg: "rgba(245, 158, 11, 0.06)",
      title: "#fbbf24"
    },
    danger: {
      border: "rgba(239, 68, 68, 0.34)",
      bg: "rgba(239, 68, 68, 0.06)",
      title: "#fca5a5"
    },
    success: {
      border: "rgba(16, 185, 129, 0.32)",
      bg: "rgba(16, 185, 129, 0.05)",
      title: "#86efac"
    }
  }[tone] || {};
  return (
    <div
      className="sl-inst-callout"
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.bg
      }}
    >
      <div className="flex items-start gap-3">
        {icon ? <div className="shrink-0 mt-0.5">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          {title ? (
            <p
              className="text-[12px] font-semibold uppercase tracking-[0.16em] mb-1"
              style={{ color: palette.title }}
            >
              {title}
            </p>
          ) : null}
          <div className="text-[13px] text-[var(--sl-text-secondary)] leading-relaxed">{children}</div>
        </div>
      </div>
      <style jsx global>{`
        .sl-inst-callout {
          padding: 12px 14px;
        }
      `}</style>
    </div>
  );
}
