import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setGlobalHealthPollIntervalMs } from "../lib/globalHealthStore";

const LS_KEY = "sentinel.warMode";

/**
 * Cockpit war posture. Public API (stable):
 * - `isWarMode` — persisted under {@link LS_KEY}
 * - `toggleWarMode` — prefer this name over a generic `toggle` in multi-layer UIs
 * - `hydrated` — client has read `localStorage` (avoid SSR/CSR mismatch flashes in consumers)
 */
const WarModeContext = createContext({
  isWarMode: false,
  toggleWarMode: () => {},
  hydrated: false
});

export function WarModeProvider({ children }) {
  const [isWarMode, setIsWarMode] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
      if (stored !== null) setIsWarMode(stored === "true");
    } catch (_) {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("sl-war-mode") === "1";
    if (saved) {
      setIsWarMode(true);
      document.body.classList.add("war-mode-active");
      document.documentElement.style.setProperty("--current-accent", "#FACC15");
    }
  }, []);

  useEffect(() => {
    if (!hydrated || typeof document === "undefined") return;
    document.body.classList.toggle("war-mode-active", isWarMode);
    document.documentElement.style.setProperty(
      "--current-accent",
      isWarMode ? "#FACC15" : "#8B5CF6"
    );
    return () => {
      document.body.classList.remove("war-mode-active");
    };
  }, [hydrated, isWarMode]);

  useEffect(() => {
    if (!hydrated) return;
    setGlobalHealthPollIntervalMs(isWarMode ? 3_000 : 10_000);
  }, [hydrated, isWarMode]);

  const toggleWarMode = useCallback(() => {
    const next = !isWarMode;
    setIsWarMode(next);

    if (typeof window !== "undefined") {
      document.body.classList.toggle("war-mode-active", next);
      document.documentElement.style.setProperty(
        "--current-accent",
        next ? "#FACC15" : "#8B5CF6"
      );
      localStorage.setItem("sl-war-mode", next ? "1" : "0");
      window.dispatchEvent(new CustomEvent("war-mode-change", { detail: { active: next } }));
    }
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, String(next));
    } catch (_) {}
  }, [isWarMode]);

  const value = useMemo(
    () => ({
      isWarMode,
      toggleWarMode,
      hydrated
    }),
    [isWarMode, toggleWarMode, hydrated]
  );

  return <WarModeContext.Provider value={value}>{children}</WarModeContext.Provider>;
}

export function useWarMode() {
  return useContext(WarModeContext);
}
