import { useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers
  };
  const res = await fetch(`${API_URL}${url}`, { ...options, headers });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export function useWatchlist() {
  const queryClient = useQueryClient();

  const addToWatchlist = useMutation({
    mutationFn: (tokenAddress) =>
      fetchWithAuth("/api/v1/watchlist", {
        method: "POST",
        body: JSON.stringify({ tokenAddress })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["token"] })
  });

  const removeFromWatchlist = useMutation({
    mutationFn: (tokenAddress) =>
      fetchWithAuth(`/api/v1/watchlist/${tokenAddress}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["token"] })
  });

  const updateNote = useMutation({
    mutationFn: ({ tokenAddress, note }) =>
      fetchWithAuth(`/api/v1/watchlist/${tokenAddress}/note`, {
        method: "PATCH",
        body: JSON.stringify({ note })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["token"] })
  });

  return {
    addToWatchlist: addToWatchlist.mutateAsync,
    removeFromWatchlist: removeFromWatchlist.mutateAsync,
    updateNote: updateNote.mutateAsync,
    isLoading: addToWatchlist.isPending || removeFromWatchlist.isPending
  };
}

