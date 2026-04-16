import { useQueries } from "@tanstack/react-query";

async function fetchToken(address, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/token/${address}`, { headers });
  if (!res.ok) throw new Error("Failed to fetch token");
  return res.json();
}

export function useTokenCompare(leftAddress, rightAddress) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const left = (leftAddress || "").trim();
  const right = (rightAddress || "").trim();

  const [leftQuery, rightQuery] = useQueries({
    queries: [
      {
        queryKey: ["token-compare", "left", left, token ? "auth" : "anon"],
        queryFn: () => fetchToken(left, token),
        enabled: left.length >= 32,
        staleTime: 30000
      },
      {
        queryKey: ["token-compare", "right", right, token ? "auth" : "anon"],
        queryFn: () => fetchToken(right, token),
        enabled: right.length >= 32,
        staleTime: 30000
      }
    ]
  });

  return { leftQuery, rightQuery };
}

