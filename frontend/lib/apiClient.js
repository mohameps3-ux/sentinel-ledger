import { getPublicApiUrl } from "./publicRuntime";

export class ApiError extends Error {
  constructor(message, { status = 0, url = "", kind = "unknown", body = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    this.kind = kind;
    this.body = body;
  }
}

export function apiUrl(path) {
  const base = getPublicApiUrl();
  const p = String(path || "");
  if (/^https?:\/\//i.test(p)) return p;
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
}

export function classifyApiStatus(status) {
  if (status === 0) return "backend_offline";
  if (status === 404) return "wrong_endpoint";
  if (status === 401 || status === 403) return "auth_required";
  if (status >= 500) return "backend_error";
  if (status >= 400) return "request_error";
  return "ok";
}

export function classifyApiFailure(status, body = "") {
  const text = String(body || "").toLowerCase();
  if (
    status === 500 &&
    (text.includes("econnrefused") ||
      text.includes("connection refused") ||
      text.includes("proxy") ||
      text.includes("fetch failed"))
  ) {
    return "backend_offline";
  }
  return classifyApiStatus(status);
}

export async function apiFetch(path, options = {}) {
  const url = apiUrl(path);
  let res;
  try {
    res = await fetch(url, options);
  } catch (error) {
    throw new ApiError(error?.message || "Backend connection failed", {
      status: 0,
      url,
      kind: "backend_offline"
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(`API request failed with ${res.status}`, {
      status: res.status,
      url,
      kind: classifyApiFailure(res.status, body),
      body
    });
  }

  return res;
}

export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options);
  return res.json();
}
