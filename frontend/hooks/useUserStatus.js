import { useEffect, useState } from "react";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "./useClientAuthToken";

export function useUserStatus() {
  const token = useClientAuthToken();
  const [status, setStatus] = useState({
    loading: true,
    plan: "free",
    expiresAt: null,
    isPro: false
  });

  useEffect(() => {
    let alive = true;
    async function loadStatus() {
      if (!token) {
        if (!alive) return;
        setStatus({ loading: false, plan: "free", expiresAt: null, isPro: false });
        return;
      }
      try {
        const res = await fetch(`${getPublicApiUrl()}/api/v1/user/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || "status_unavailable");
        const data = json.data || {};
        setStatus({
          loading: false,
          plan: data.plan || "free",
          expiresAt: data.expiresAt || null,
          isPro: !!data.isPro
        });
      } catch {
        if (!alive) return;
        setStatus({ loading: false, plan: "free", expiresAt: null, isPro: false });
      }
    }
    loadStatus();
    return () => {
      alive = false;
    };
  }, [token]);

  return status;
}
