import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchSmartMoney(address, token) {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/smart-wallets/${address}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) {
    let message = "Failed to fetch smart money";
    try {
      const json = await res.json();
      if (json?.error) message = String(json.error);
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

export function useSmartMoney(address, token) {
  return useQuery({
    queryKey: ["smart-money", address, token],
    queryFn: () => fetchSmartMoney(address, token),
    enabled: !!address && !!token,
    staleTime: 30000
  });
}

