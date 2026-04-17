import { useQueries } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "./useClientAuthToken";

async function fetchToken(address, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${getPublicApiUrl()}/api/v1/token/${address}`, { headers });
  if (!res.ok) throw new Error("Failed to fetch token");
  return res.json();
}

function isValidMint(s) {
  const t = (s || "").trim();
  return t.length >= 32 && t.length <= 64;
}

export function useTokenCompare(leftAddress, rightAddress) {
  const clientToken = useClientAuthToken();
  const left = (leftAddress || "").trim();
  const right = (rightAddress || "").trim();

  const [leftQuery, rightQuery] = useQueries({
    queries: [
      {
        queryKey: ["token-compare", "left", left, clientToken ? "auth" : "anon"],
        queryFn: () => fetchToken(left, clientToken),
        enabled: isValidMint(left),
        staleTime: 30000
      },
      {
        queryKey: ["token-compare", "right", right, clientToken ? "auth" : "anon"],
        queryFn: () => fetchToken(right, clientToken),
        enabled: isValidMint(right),
        staleTime: 30000
      }
    ]
  });

  return { leftQuery, rightQuery };
}
