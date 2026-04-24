/**
 * Tiny client telemetry queue for product timing signals.
 * Local-first: persists a bounded ring buffer and optionally sendBeacons to the API.
 */

import { getPublicApiUrl } from "./publicRuntime";

const STORAGE_KEY = "sentinel.telemetry.v1";
const MAX_EVENTS = 80;
const THROTTLE_MS = 10_000;
const lastSent = new Map();

function readEvents() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch (_) {}
}

function safePayload(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (/token|secret|signature|authorization/i.test(k)) continue;
    if (v == null || typeof v === "boolean" || typeof v === "number") out[k] = v;
    else out[k] = String(v).slice(0, 180);
  }
  return out;
}

export function recordClientTelemetry(type, data = {}, options = {}) {
  if (typeof window === "undefined") return null;
  const t = String(type || "").trim().slice(0, 48);
  if (!/^[a-z0-9_.-]{3,48}$/i.test(t)) return null;

  const key = `${t}:${data.path || ""}`;
  const now = Date.now();
  if (!options.bypassThrottle && lastSent.has(key) && now - lastSent.get(key) < THROTTLE_MS) return null;
  lastSent.set(key, now);

  const event = {
    id: `${now}:${Math.random().toString(36).slice(2, 8)}`,
    type: t,
    t: now,
    path: typeof window.location?.pathname === "string" ? window.location.pathname : "",
    data: safePayload(data)
  };
  writeEvents([event, ...readEvents()]);

  const endpoint = getPublicApiUrl();
  if (endpoint && navigator.sendBeacon) {
    try {
      const body = JSON.stringify({ event });
      navigator.sendBeacon(`${endpoint.replace(/\/$/, "")}/api/v1/telemetry/client`, new Blob([body], { type: "application/json" }));
    } catch (_) {}
  }
  return event;
}

export function getClientTelemetryEvents() {
  return readEvents();
}
