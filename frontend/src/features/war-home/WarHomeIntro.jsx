import { Volume2, VolumeX } from "lucide-react";

const STRATEGY_OPTIONS = [
  { id: "conservative", label: "Prudente" },
  { id: "balanced", label: "Equilibrado" },
  { id: "aggressive", label: "Más riesgo" }
];

export default function WarHomeIntro({ strategyMode, onStrategyModeChange, soundEnabled, onToggleSound }) {
  return (
    <>
      <section className="sl-section !mb-6">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Seguimiento de smart money en Solana</h1>
          <p className="text-sm text-gray-400 mt-2 max-w-2xl leading-relaxed">
            Un solo flujo: ver señales, abrir un token y decidir. No es asesoramiento financiero: tú priorizas el riesgo.
          </p>
        </div>
      </section>

      <section className="sl-section !mt-0 !pt-1 !pb-1">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="text-xs text-gray-500 leading-relaxed min-w-0">
              Ajusta cómo de estricta es la sugerencia. Sonido solo avisa; no es obligatorio.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {STRATEGY_OPTIONS.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onStrategyModeChange(mode.id)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border ${
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
                className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white"
              >
                {soundEnabled ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Volume2 size={14} /> Sonido
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <VolumeX size={14} /> Silencio
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
