import { useMemo } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useLocale } from "../../../contexts/LocaleContext";

export default function WarHomeIntro({ strategyMode, onStrategyModeChange, soundEnabled, onToggleSound }) {
  const { t } = useLocale();
  const strategyOptions = useMemo(
    () => [
      { id: "conservative", label: t("war.intro.strategy.conservative") },
      { id: "balanced", label: t("war.intro.strategy.balanced") },
      { id: "aggressive", label: t("war.intro.strategy.aggressive") }
    ],
    [t]
  );

  return (
    <>
      <section className="sl-section !mt-0 !mb-1">
        <div className="sl-glow-info rounded-lg border border-white/[0.08] bg-white/[0.02] h-[1cm] px-2 flex items-center transition-all duration-200 hover:-translate-y-[1px] hover:border-cyan-400/45 hover:shadow-[0_0_14px_rgba(34,211,238,0.16)]">
          <p
            className="text-[11px] sm:text-xs text-gray-300 truncate w-full leading-tight"
            title={`${t("war.intro.ribbonTitle")} · ${t("war.intro.ribbonBody")}`}
          >
            <span className="text-white font-semibold">{t("war.intro.ribbonTitle")}</span>
            {" · "}
            {t("war.intro.ribbonBody")}
          </p>
        </div>
      </section>

      <section className="sl-section !mt-0 !pt-0 !pb-0">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 sm:p-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <p className="text-[11px] text-gray-500 leading-snug min-w-0">{t("war.intro.strategyHint")}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {strategyOptions.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onStrategyModeChange(mode.id)}
                  className={`text-[11px] px-2 py-1 rounded-md border ${
                    strategyMode === mode.id
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onToggleSound}
                className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-gray-400 hover:text-white"
              >
                {soundEnabled ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Volume2 size={14} /> {t("war.intro.soundOn")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <VolumeX size={14} /> {t("war.intro.soundOff")}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
