import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchToken(address, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(
    `${getPublicApiUrl()}/api/v1/token/${address}`,
    { headers }
  );
  if (!res.ok) throw new Error("Failed to fetch token");
  return res.json();
}

export function useTokenData(address) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return useQuery({
    queryKey: ["token", address, token ? "auth" : "anon"],
    queryFn: () => fetchToken(address, token),
    enabled: !!address,
    staleTime: 30000
  });
}

