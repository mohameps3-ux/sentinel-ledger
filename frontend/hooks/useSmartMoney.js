import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchSmartMoney(address) {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/smart-wallets/${address}`);
  if (!res.ok) throw new Error("Failed to fetch smart money");
  return res.json();
}

export function useSmartMoney(address) {
  return useQuery({
    queryKey: ["smart-money", address],
    queryFn: () => fetchSmartMoney(address),
    enabled: !!address,
    staleTime: 30000
  });
}

