import { useLocale } from "../../contexts/LocaleContext";

/**
 * Tab strip + panels (display toggled, nodes stay mounted for sockets / RQ).
 */
export function TacticalTabs({
  activeTab,
  onTabChange,
  panelLive,
  panelHot,
  panelOutlier,
  panelTrack,
  panelVelocity
}) {
  const { t } = useLocale();
  const tabs = [
    { id: "live", label: t("war.tactical.tabLive") },
    { id: "hot", label: t("war.tactical.tabHot") },
    { id: "velocity", label: t("war.tactical.tabVelocity") },
    { id: "outlier", label: t("war.tactical.tabOutlier") },
    { id: "track", label: t("war.tactical.tabTrack") }
  ];

  return (
    <div className="space-y-2">
      <div
        className="sl-tactical-tabs-strip sticky top-1 z-20 -mx-1 flex flex-nowrap items-end gap-2 overflow-x-auto border-b border-white/[0.08] bg-[var(--sl-bg-base)]/90 px-1 pt-1 backdrop-blur-md [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:static md:mx-0 md:gap-3 md:bg-transparent md:backdrop-blur-0"
        role="tablist"
        aria-label={t("war.tactical.aria")}
      >
        <span className="font-mono text-xs text-sl-muted uppercase tracking-wider shrink-0 pb-2 pt-1">
          VELOCITY
        </span>
        <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tactical-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`tactical-panel-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`relative shrink-0 inline-flex items-center gap-1 pb-2 pt-1 text-[11px] sm:text-xs font-bold uppercase tracking-[0.14em] transition-all duration-200 ${
                activeTab === tab.id
                  ? "text-indigo-100 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-indigo-400"
                  : "text-gray-500 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
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
          id="tactical-panel-velocity"
          role="tabpanel"
          aria-labelledby="tactical-tab-velocity"
          hidden={activeTab !== "velocity"}
          className={activeTab === "velocity" ? "sl-panel-enter" : ""}
        >
          {panelVelocity}
        </div>
        <div
          id="tactical-panel-outlier"
          role="tabpanel"
          aria-labelledby="tactical-tab-outlier"
          hidden={activeTab !== "outlier"}
          className={activeTab === "outlier" ? "sl-panel-enter" : ""}
        >
          {panelOutlier}
        </div>
        <div
          id="tactical-panel-track"
          role="tabpanel"
          aria-labelledby="tactical-tab-track"
          hidden={activeTab !== "track"}
          className={activeTab === "track" ? "sl-panel-enter" : ""}
        >
          {panelTrack}
        </div>
      </div>
    </div>
  );
}
