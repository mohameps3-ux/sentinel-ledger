import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sentinel-home-terminal-onboarding";

const STEPS = [
  {
    title: "Señales en vivo",
    body: "Filtramos ruido y enseñamos qué vigila el dinero inteligente, con una puntuación (0–100) y sugerencia clara (entrar, preparar, esperar)."
  }
];

export function HomeOnboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      return;
    }
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sentinel-onboarding-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0c0e12] shadow-[0_0_48px_rgba(16,185,129,0.12)] p-6 sm:p-8 space-y-6">
        <p className="text-[10px] uppercase tracking-widest text-center text-gray-500">Primera visita</p>
        <div className="space-y-2 text-center">
          <h2 id="sentinel-onboarding-title" className="text-lg sm:text-xl font-bold text-white">
            {STEPS[0].title}
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">{STEPS[0].body}</p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-3 rounded-xl font-semibold text-[#050508] bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 transition shadow-[0_0_24px_rgba(52,211,153,0.25)]"
          >
            Empezar
          </button>
          <button type="button" onClick={dismiss} className="text-xs text-gray-500 hover:text-gray-300 py-1">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
