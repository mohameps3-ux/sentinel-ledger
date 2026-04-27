import { useState, useEffect, useRef, useCallback } from "react";
import { getCanvasFingerprint } from "../lib/fingerprint";
import { getPublicApiUrl } from "../lib/publicRuntime";

function getApi() {
  return getPublicApiUrl();
}

function mergeTimeFromExpires(expiresAt) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return { hoursLeft: 0, minutesLeft: 0, secondsLeft: 0, isCritical: false };
  }
  return {
    hoursLeft: Math.floor(diff / 3600000),
    minutesLeft: Math.floor((diff % 3600000) / 60000),
    secondsLeft: Math.floor((diff % 60000) / 1000),
    isCritical: diff < 3600000
  };
}

export function useGuestTrial() {
  const [trial, setTrial] = useState({ status: "loading" });
  const fpRef = useRef(null);
  const timerRef = useRef(null);

  const init = useCallback(async () => {
    try {
      fpRef.current = await getCanvasFingerprint();
      const headers = {};
      if (fpRef.current) headers["x-fp-hash"] = fpRef.current;
      const res = await fetch(`${getApi()}/api/v1/trial/status`, { headers, credentials: "omit" });
      const data = await res.json();
      if (data?.status === "active" && data?.expiresAt) {
        setTrial({ ...data, ...mergeTimeFromExpires(data.expiresAt) });
        return;
      }
      setTrial(data);
    } catch {
      setTrial({ status: "none", eligible: true });
    }
  }, []);

  useEffect(() => {
    void init();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [init]);

  useEffect(() => {
    if (trial.status !== "active" || !trial.expiresAt) return;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTrial((t) => {
        if (t.status !== "active" || !t.expiresAt) return t;
        const next = mergeTimeFromExpires(t.expiresAt);
        if (next.hoursLeft + next.minutesLeft + next.secondsLeft <= 0) {
          return { ...t, status: "expired", ...next };
        }
        return { ...t, ...next };
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [trial.status, trial.expiresAt]);

  async function startTrial() {
    try {
      const fp = fpRef.current || (await getCanvasFingerprint());
      const headers = { "Content-Type": "application/json" };
      if (fp) headers["x-fp-hash"] = fp;
      const res = await fetch(`${getApi()}/api/v1/trial/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fingerprintHash: fp || null })
      });
      const data = await res.json();
      if (data.ok) {
        setTrial({
          ...data,
          status: "active",
          expiresAt: data.expiresAt,
          ...mergeTimeFromExpires(data.expiresAt)
        });
      }
      return data;
    } catch {
      return { ok: false };
    }
  }

  return {
    trial,
    startTrial,
    isTrialActive: trial.status === "active",
    canStartTrial: trial.eligible === true,
    isCritical: Boolean(trial.isCritical)
  };
}
