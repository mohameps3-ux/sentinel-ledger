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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2" role="tablist" aria-label="Tactical feed">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tactical-tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`tactical-panel-${t.id}`}
            onClick={() => onTabChange(t.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
              activeTab === t.id
                ? "border-cyan-500/45 bg-cyan-500/10 text-cyan-100"
                : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-gray-200 hover:border-white/18"
            }`}
          >
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
        >
          {panelLive}
        </div>
        <div
          id="tactical-panel-hot"
          role="tabpanel"
          aria-labelledby="tactical-tab-hot"
          hidden={activeTab !== "hot"}
        >
          {panelHot}
        </div>
        <div
          id="tactical-panel-history"
          role="tabpanel"
          aria-labelledby="tactical-tab-history"
          hidden={activeTab !== "history"}
        >
          {panelHistory}
        </div>
      </div>
    </div>
  );
}
