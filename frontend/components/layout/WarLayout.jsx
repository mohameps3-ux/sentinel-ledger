/**
 * War Cockpit — Phase 0 shell only.
 *
 * Rigid viewport band under fixed navbar + home tension bar (see globals.css
 * --sl-nav-h, --sl-bar-h, --sl-safe-gap). Internal scroll is isolated to the
 * feed and desk columns; this component does not own any product logic.
 */
export function WarLayout({ header, feed, desk }) {
  const chromeOffset = "var(--sl-nav-h) + var(--sl-bar-h) + var(--sl-safe-gap)";
  const bandHeight = `calc(100dvh - (${chromeOffset}))`;

  return (
    <div
      className="relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-cyan-500/25 bg-[#080d14] shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_12px_48px_rgba(0,0,0,0.45)] ring-1 ring-cyan-500/15 sm:mx-0.5"
      style={{ height: bandHeight, maxHeight: bandHeight }}
      data-home-war-layout="1"
    >
      <div
        className="pointer-events-none absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent opacity-90"
        aria-hidden
      />
      <div className="shrink-0 border-b border-cyan-950/50 bg-[#050a10]/95 px-3 py-2 sm:px-4">{header}</div>

      {/* Feed = casi todo el ancho; desk = rail estrecho a la derecha */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(12.5rem,15rem)]">
        {/* Mobile / tablet: desk first so Intel + ?t= is visible without scrolling past the whole feed */}
        <div className="order-2 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-slate-800/80 lg:order-1 lg:border-r">
          {feed}
        </div>
        <div className="order-1 min-h-0 min-w-0 max-h-[42dvh] overflow-y-auto overflow-x-hidden border-b border-slate-800/80 lg:order-2 lg:max-h-none lg:border-b-0 lg:border-t-0">
          {desk}
        </div>
      </div>
    </div>
  );
}
