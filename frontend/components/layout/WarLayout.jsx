/**
 * War Cockpit — Phase 0 shell only.
 *
 * Rigid viewport band under fixed navbar + home tension bar (see globals.css
 * --sl-nav-h, --sl-bar-h, --sl-safe-gap). Internal scroll is isolated to the
 * feed and desk columns; this component does not own any product logic.
 */
function DeskPanel({ desk }) {
  return (
    <>
      <div className="flex h-10 items-center justify-between border-b border-white/[0.06] px-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-sl-text">Token Intel</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
          <span className="sl-pulse-dot" />
          live
        </span>
      </div>
      <div className="lg:h-[calc(100%-2.5rem)] lg:overflow-y-auto">{desk}</div>
    </>
  );
}

export function WarLayout({ header, feed, desk }) {
  const chromeOffset = "var(--sl-nav-actual, var(--sl-nav-h)) + var(--sl-status-h) + var(--sl-safe-gap)";
  const bandHeight = `calc(100dvh - (${chromeOffset}))`;

  return (
    <div
      className="relative flex w-full min-w-0 flex-col overflow-visible bg-[var(--sl-bg-base)] lg:overflow-hidden"
      style={{ height: bandHeight, maxHeight: bandHeight }}
      data-home-war-layout="1"
    >
      {header ? (
        <div className="shrink-0 border-b border-white/[0.06] bg-[var(--sl-bg-surface)] px-3 py-2 sm:px-4">{header}</div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-visible px-2 pb-3 pt-2 lg:grid lg:grid-cols-[minmax(0,65%)_minmax(20rem,35%)] lg:overflow-hidden lg:px-3">
        <div className="min-h-0 min-w-0 overflow-visible lg:overflow-y-auto overflow-x-hidden">{feed}</div>

        {desk ? (
          <div className="min-w-0 overflow-hidden border border-white/[0.08] bg-[var(--sl-bg-surface)] lg:hidden">
            <DeskPanel desk={desk} />
          </div>
        ) : null}

        {desk ? (
          <div className="hidden min-h-0 min-w-0 overflow-hidden border border-white/[0.08] bg-[var(--sl-bg-surface)] lg:block">
            <DeskPanel desk={desk} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
