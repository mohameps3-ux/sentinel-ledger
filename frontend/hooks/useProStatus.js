import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "./useClientAuthToken";

async function fetchProStatus(token) {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/user/status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("status_failed");
  return res.json();
}

/** Subscription / PRO gate for UI (Telegram alerts, etc.). Only runs when a JWT is present. */
export function useProStatus() {
  const clientToken = useClientAuthToken();
  return useQuery({
    queryKey: ["user-status", clientToken ? "auth" : "anon"],
    queryFn: () => fetchProStatus(clientToken),
    enabled: Boolean(clientToken),
    staleTime: 120_000
  });
}
