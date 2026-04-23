const TABS = [
  { id: "live", label: "LIVE" },
  { id: "hot", label: "HOT" },
  { id: "history", label: "HISTORY" }
];

/**
 * Tab strip + three panels (display toggled, nodes stay mounted for sockets / RQ).
 */
export function TacticalTabs({ activeTab, onTabChange, panelLive, panelHot, panelHistory }) {
  return (
    <div className="space-y-2 sm:space-y-3">
      <div
        className="sticky top-1 z-20 -mx-1 px-1 py-1 rounded-xl border border-white/[0.08] bg-[#07090d]/86 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)] flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:static md:mx-0 md:px-0 md:py-0 md:rounded-none md:border-0 md:bg-transparent md:backdrop-blur-0 md:shadow-none md:border-b md:border-white/10 md:pb-2"
        role="tablist"
        aria-label="Tactical feed"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tactical-tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`tactical-panel-${t.id}`}
            onClick={() => onTabChange(t.id)}
            className={`shrink-0 inline-flex items-center gap-1 text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-md sm:rounded-lg border font-semibold transition-all duration-200 ${
              activeTab === t.id
                ? "border-cyan-400/55 bg-cyan-500/14 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.18)]"
                : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-gray-200 hover:border-white/18 hover:bg-white/[0.06]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeTab === t.id ? "bg-cyan-300" : "bg-gray-600"
              }`}
              aria-hidden
            />
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 space-y-0">
        <div
          id="tactical-panel-live"
          role="tabpanel"
          aria-labelledby="tactical-tab-live"
          hidden={activeTab !== "live"}
          className={activeTab === "live" ? "sl-panel-enter" : ""}
        >
          {panelLive}
        </div>
        <div
          id="tactical-panel-hot"
          role="tabpanel"
          aria-labelledby="tactical-tab-hot"
          hidden={activeTab !== "hot"}
          className={activeTab === "hot" ? "sl-panel-enter" : ""}
        >
          {panelHot}
        </div>
        <div
          id="tactical-panel-history"
          role="tabpanel"
          aria-labelledby="tactical-tab-history"
          hidden={activeTab !== "history"}
          className={activeTab === "history" ? "sl-panel-enter" : ""}
        >
          {panelHistory}
        </div>
      </div>
    </div>
  );
}
