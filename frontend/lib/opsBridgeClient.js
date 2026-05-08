/** Same-origin path; query string preserved. */
export function toOpsBridgeUrl(apiPathAndQuery) {
  const p = apiPathAndQuery.startsWith("/api/") ? apiPathAndQuery : `/api${apiPathAndQuery}`;
  const tail = p.startsWith("/api/") ? p.slice("/api/".length) : p.replace(/^\//, "");
  return `/api/ops-bridge/${tail}`;
}

function getBrowserOpsKey() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("sentinel-ops-key") || "";
  } catch {
    return "";
  }
}

export async function opsBridgeFetch(apiPathAndQuery, options = {}) {
  const opsKey = getBrowserOpsKey();
  return fetch(toOpsBridgeUrl(apiPathAndQuery), {
    ...options,
    credentials: "include",
    headers: {
      ...(opsKey ? { "x-ops-key": opsKey } : {}),
      ...(options.headers || {})
    }
  });
}

export async function withOpsBridge(path, options = {}) {
  const res = await opsBridgeFetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "request_failed");
  return body;
}
