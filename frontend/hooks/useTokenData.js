import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "./useClientAuthToken";
import { isProbableSolanaMint } from "../lib/solanaMint.mjs";

async function fetchToken(address, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${getPublicApiUrl()}/api/v1/token/${address}`, { headers });
  if (!res.ok) throw new Error("Failed to fetch token");
  return res.json();
}

export function useTokenData(address) {
  const clientToken = useClientAuthToken();
  const enabled = isProbableSolanaMint(address);

  return useQuery({
    queryKey: ["token", address, clientToken ? "auth" : "anon"],
    queryFn: () => fetchToken(address, clientToken),
    enabled,
    staleTime: 30000
  });
}
