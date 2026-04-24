import { useLocale } from "../../contexts/LocaleContext";

/**
 * Tab strip + three panels (display toggled, nodes stay mounted for sockets / RQ).
 */
export function TacticalTabs({ activeTab, onTabChange, panelLive, panelHot, panelOutlier, panelTrack }) {
  const { t } = useLocale();
  const tabs = [
    { id: "live", label: t("war.tactical.tabLive"), order: "order-2 md:order-1" },
    { id: "hot", label: t("war.tactical.tabHot"), order: "order-3 md:order-2" },
    { id: "outlier", label: t("war.tactical.tabOutlier"), order: "order-1 md:order-3" },
    { id: "track", label: t("war.tactical.tabTrack"), order: "order-4 md:order-4" }
  ];

  return (
    <div className="space-y-2 sm:space-y-3">
      <div
        className="sl-tactical-tabs-strip sticky top-1 z-20 -mx-1 px-1 py-1 rounded-xl border border-white/[0.08] bg-[#07090d]/86 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)] flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:static md:mx-0 md:px-0 md:py-0 md:rounded-none md:border-0 md:bg-transparent md:backdrop-blur-0 md:shadow-none md:border-b md:border-white/10 md:pb-2"
        role="tablist"
        aria-label={t("war.tactical.aria")}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tactical-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tactical-panel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`shrink-0 inline-flex items-center gap-1 text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-md sm:rounded-lg border font-semibold transition-all duration-200 ${tab.order} ${
              activeTab === tab.id
                ? "border-cyan-400/55 bg-cyan-500/14 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.18)]"
                : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-gray-200 hover:border-white/18 hover:bg-white/[0.06]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeTab === tab.id ? "bg-cyan-300" : "bg-gray-600"
              }`}
              aria-hidden
            />
            {tab.label}
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
