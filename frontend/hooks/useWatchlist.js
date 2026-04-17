import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

const LOCAL_WATCHLIST_KEY = "sentinel-watchlist-cache";
const LOCAL_NOTES_KEY = "sentinel-watchlist-notes";

function readLocalList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_WATCHLIST_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalList(next) {
  localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(next));
}

function writeLocalNote(tokenAddress, note) {
  try {
    const current = JSON.parse(localStorage.getItem(LOCAL_NOTES_KEY) || "{}");
    current[tokenAddress] = note || "";
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(current));
  } catch {
    // noop
  }
}

async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem("token");
  if (!token) {
    const err = new Error("auth_required");
    err.status = 401;
    throw err;
  }
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...options.headers
  };
  const res = await fetch(`${getPublicApiUrl()}${url}`, { ...options, headers });
  if (!res.ok) {
    const err = new Error("Request failed");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function useWatchlist() {
  const queryClient = useQueryClient();

  const addToWatchlist = useMutation({
    mutationFn: async (tokenAddress) => {
      try {
        return await fetchWithAuth("/api/v1/watchlist", {
          method: "POST",
          body: JSON.stringify({ tokenAddress })
        });
      } catch (e) {
        if (e?.status !== 401) throw e;
        const current = readLocalList();
        const next = [tokenAddress, ...current.filter((x) => x !== tokenAddress)].slice(0, 50);
        writeLocalList(next);
        return { ok: true, local: true, data: { tokenAddress } };
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["token"] })
  });

  const removeFromWatchlist = useMutation({
    mutationFn: async (tokenAddress) => {
      try {
        return await fetchWithAuth(`/api/v1/watchlist/${tokenAddress}`, { method: "DELETE" });
      } catch (e) {
        if (e?.status !== 401) throw e;
        const current = readLocalList();
        writeLocalList(current.filter((x) => x !== tokenAddress));
        return { ok: true, local: true };
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["token"] })
  });

  const updateNote = useMutation({
    mutationFn: async ({ tokenAddress, note }) => {
      try {
        return await fetchWithAuth(`/api/v1/watchlist/${tokenAddress}/note`, {
          method: "PATCH",
          body: JSON.stringify({ note })
        });
      } catch (e) {
        if (e?.status !== 401) throw e;
        writeLocalNote(tokenAddress, note);
        return { ok: true, local: true };
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["token"] })
  });

  return {
    addToWatchlist: addToWatchlist.mutateAsync,
    removeFromWatchlist: removeFromWatchlist.mutateAsync,
    updateNote: updateNote.mutateAsync,
    isLoading: addToWatchlist.isPending || removeFromWatchlist.isPending
  };
}

