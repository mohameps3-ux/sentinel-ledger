import { useEffect, useState } from "react";

/**
 * Reads `localStorage` auth token only after mount so SSR + first client paint match
 * (avoids hydration mismatch and unstable React Query keys from reading storage during render).
 */
export function useClientAuthToken() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    try {
      setToken(localStorage.getItem("token"));
    } catch {
      setToken(null);
    }
  }, []);

  return token;
}
