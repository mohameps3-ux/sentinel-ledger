import { RailCard } from "./RailCard";

const RAIL_META = {
  hot: {
    icon: "🔥",
    title: "Hot",
    subtitle: "Where the action is",
    empty: "No hot tokens right now. The market is quiet — or smart wallets are sleeping."
  },
  live: {
    icon: "📡",
    title: "Live",
    subtitle: "Engine firing now",
    empty: "Engine isn't firing on any token this minute. Signals are selective on purpose."
  },
  velocity: {
    icon: "⚡",
    title: "Velocity",
    subtitle: "Accelerating now",
    empty: "No tokens accelerating right now."
  }
};

function SkeletonCards() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[168px] shrink-0 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.03]"
          style={{ width: "min(88vw, 240px)" }}
        />
      ))}
    </>
  );
}

export function RailSection({ rail, items = [], isLoading = false, showSlowMessage = false, pulsingMints }) {
  const meta = RAIL_META[rail] || RAIL_META.hot;
  const hasItems = items.length > 0;

  return (
    <section className="sl-section mb-1">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-base" aria-hidden>
          {meta.icon}
        </span>
        <div>
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-sl-text">
            {meta.title}
            <span className="ml-2 font-normal text-sl-muted">· {meta.subtitle}</span>
          </h2>
        </div>
      </div>
      {isLoading && !hasItems ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SkeletonCards />
        </div>
      ) : null}
      {showSlowMessage && isLoading ? (
        <p className="py-2 text-center text-[11px] text-sl-muted">Loading market state...</p>
      ) : null}
      {!isLoading && !hasItems ? (
        <p className="rounded-lg border border-white/[0.06] bg-sl-card/40 px-3 py-4 text-[12px] leading-relaxed text-sl-muted">{meta.empty}</p>
      ) : null}
      {hasItems ? (
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <RailCard
              key={`${rail}-${item.token_address}`}
              item={{ ...item, rail }}
              pulsing={pulsingMints?.has?.(item.token_address)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Three rails stack for home (between KPI strip and TacticalFeed). */
export function HomeRailsBoard({ hot, live, velocity, isLoading, isSlowLoad, pulsingMints }) {
  return (
    <div className="flex flex-col gap-1">
      <RailSection rail="hot" items={hot} isLoading={isLoading} showSlowMessage={isSlowLoad} pulsingMints={pulsingMints} />
      <RailSection rail="live" items={live} isLoading={isLoading} showSlowMessage={isSlowLoad} pulsingMints={pulsingMints} />
      <RailSection rail="velocity" items={velocity} isLoading={isLoading} showSlowMessage={isSlowLoad} pulsingMints={pulsingMints} />
    </div>
  );
}
