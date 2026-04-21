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
    if (!hydrated || typeof document === "undefined") return;
    document.body.classList.toggle("war-mode", isWarMode);
    return () => {
      document.body.classList.remove("war-mode");
    };
  }, [hydrated, isWarMode]);

  useEffect(() => {
    if (!hydrated) return;
    setGlobalHealthPollIntervalMs(isWarMode ? 3_000 : 10_000);
  }, [hydrated, isWarMode]);

  const toggleWarMode = useCallback(() => {
    setIsWarMode((prev) => {
      const next = !prev;
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, String(next));
      } catch (_) {}
      return next;
    });
  }, []);

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
