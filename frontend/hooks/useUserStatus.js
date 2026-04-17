import { useEffect, useState } from "react";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "./useClientAuthToken";

export function useUserStatus() {
  const token = useClientAuthToken();
  const [status, setStatus] = useState({
    loading: true,
    plan: "free",
    status: null,
    expiresAt: null,
    isLifetime: false,
    hasProAccess: false
  });

  useEffect(() => {
    let alive = true;
    async function loadStatus() {
      if (!token) {
        if (!alive) return;
        setStatus({
          loading: false,
          plan: "free",
          status: null,
          expiresAt: null,
          isLifetime: false,
          hasProAccess: false
        });
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
          status: data.status || null,
          expiresAt: data.expiresAt || null,
          isLifetime: !!data.isLifetime,
          hasProAccess: !!data.hasProAccess
        });
      } catch {
        if (!alive) return;
        setStatus({
          loading: false,
          plan: "free",
          status: null,
          expiresAt: null,
          isLifetime: false,
          hasProAccess: false
        });
      }
    }
    loadStatus();
    return () => {
      alive = false;
    };
  }, [token]);

  return status;
}
