import { useEffect, useRef } from "react";
import { recordClientTelemetry } from "../lib/clientTelemetry.mjs";

const ACTION_EVENTS = ["pointerdown", "keydown"];

export function useTtaFirstAction(router) {
  const startedAtRef = useRef(0);
  const routeRef = useRef("");
  const firedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = router?.asPath || window.location.pathname;
    routeRef.current = path;
    startedAtRef.current = performance.now();
    firedRef.current = false;
  }, [router?.asPath]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onAction = (event) => {
      if (firedRef.current) return;
      if (event.type === "keydown") {
        const key = event.key || "";
        if (key === "Tab" || key === "Shift" || key === "Meta" || key === "Control" || key === "Alt") return;
      }
      firedRef.current = true;
      const ttaMs = Math.max(0, Math.round(performance.now() - (startedAtRef.current || performance.now())));
      recordClientTelemetry(
        "tta_first_action",
        {
          path: routeRef.current,
          ttaMs,
          action: event.type
        },
        { bypassThrottle: true }
      );
    };
    for (const type of ACTION_EVENTS) window.addEventListener(type, onAction, { capture: true, passive: true });
    return () => {
      for (const type of ACTION_EVENTS) window.removeEventListener(type, onAction, { capture: true });
    };
  }, []);
}
