import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "./useClientAuthToken";

async function fetchToken(address, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${getPublicApiUrl()}/api/v1/token/${address}`, { headers });
  if (!res.ok) throw new Error("Failed to fetch token");
  return res.json();
}

function isValidMint(s) {
  return typeof s === "string" && s.length >= 32 && s.length <= 64;
}

export function useTokenData(address) {
  const clientToken = useClientAuthToken();
  const enabled = isValidMint(address);

  return useQuery({
    queryKey: ["token", address, clientToken ? "auth" : "anon"],
    queryFn: () => fetchToken(address, clientToken),
    enabled,
    staleTime: 30000
  });
}
