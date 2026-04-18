import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sentinel-home-terminal-onboarding";

const STEPS = [
  {
    title: "Detection",
    body: "We detect Smart Money signals in real-time."
  },
  {
    title: "Sentinel Score",
    body: "We score them with SENTINEL SCORE (0–100)."
  },
  {
    title: "Your move",
    body: "We tell you what to do: ENTER NOW / PREPARE / STAY OUT."
  }
];

export function HomeOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      return;
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setStep((s) => (s >= STEPS.length - 1 ? s : s + 1));
    }, 1667);
    return () => clearInterval(id);
  }, [open]);

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
        <div className="flex gap-1.5 justify-center" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-8 bg-emerald-400" : "w-2 bg-white/20"}`}
            />
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-widest text-center text-gray-500">~5s tour · first visit</p>
        <div className="space-y-2 text-center">
          <h2 id="sentinel-onboarding-title" className="text-lg sm:text-xl font-bold text-white">
            {STEPS[step].title}
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">{STEPS[step].body}</p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-3 rounded-xl font-semibold text-[#050508] bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 transition shadow-[0_0_24px_rgba(52,211,153,0.25)]"
          >
            Start Scanning
          </button>
          <button type="button" onClick={dismiss} className="text-xs text-gray-500 hover:text-gray-300 py-1">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
