import { apiUrl, classifyApiFailure } from "./apiClient";
import { getPublicApiUrl } from "./publicRuntime";

const CHECKS = [
  { label: "health", path: "/health" },
  { label: "hot tokens", path: "/api/v1/tokens/hot?limit=1" },
  { label: "alerts settings", path: "/api/v1/alerts/settings", authOptional: true }
];

async function runCheck(check) {
  const url = apiUrl(check.path);
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = res.ok ? "" : await res.text().catch(() => "");
    return {
      ...check,
      url,
      ok: res.ok || (check.authOptional && (res.status === 401 || res.status === 403)),
      status: res.status,
      kind: classifyApiFailure(res.status, body)
    };
  } catch (error) {
    return {
      ...check,
      url,
      ok: false,
      status: 0,
      kind: "backend_offline",
      error: error?.message || "fetch_failed"
    };
  }
}

export async function runApiDiagnostics() {
  if (typeof window === "undefined") return [];
  const results = await Promise.all(CHECKS.map(runCheck));
  const base = getPublicApiUrl() || "(same-origin proxy)";
  console.groupCollapsed(`[Sentinel API] diagnostics base=${base}`);
  for (const r of results) {
    const level = r.ok ? "log" : "warn";
    console[level](`${r.label}: ${r.ok ? "OK" : "FAIL"} status=${r.status} kind=${r.kind} url=${r.url}`);
  }
  console.groupEnd();
  return results;
}

export function shouldRunApiDiagnostics() {
  if (typeof window === "undefined") return false;
  return (
    process.env.NODE_ENV !== "production" ||
    window.localStorage.getItem("sentinelApiDebug") === "1" ||
    new URLSearchParams(window.location.search).get("apiDebug") === "1"
  );
}
