/**
 * Tamper-evident desk hint from the Radar → `/?t=` shallow flow.
 * Context travels in a single `ctx` query param (base64url JSON) whose embedded
 * `m` must match `?t=`; loose `src`/`tr`/`sw` without `ctx` are ignored so edits
 * to the mint alone cannot reuse stale metadata.
 *
 * `.mjs` so Node unit tests run without MODULE_TYPELESS_PACKAGE_JSON warnings.
 */
import { isProbableSolanaMint } from "./solanaMint.mjs";

const CTX_SCHEMA = 1;
const MAX_CTX_RAW_LEN = 512;

function firstQueryValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

/** Mint selected in cockpit desk via `?t=` (shallow routing on `/`). */
export function deskMintFromQuery(query) {
  const raw = firstQueryValue(query?.t);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return isProbableSolanaMint(trimmed) ? trimmed : null;
}

function jsonToBase64Url(json) {
  const s = JSON.stringify(json);
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    try {
      return Buffer.from(s, "utf8").toString("base64url");
    } catch {
      /* fall through */
    }
  }
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(b64url) {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(b64, "base64").toString("utf8");
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/**
 * @param {string} mint
 * @param {{ src?: string, tr?: number, sw?: number } | null | undefined} ctx
 * @returns {string | null} value for `ctx` query param, or null if nothing to carry
 */
export function buildDeskRadarCtxParam(mint, ctx) {
  if (!mint || !isProbableSolanaMint(mint) || !ctx || typeof ctx !== "object") return null;
  const payload = { v: CTX_SCHEMA, m: mint };
  if (ctx.src) {
    const s = String(ctx.src).slice(0, 16);
    if (/^[a-zA-Z0-9_-]{1,16}$/.test(s)) payload.s = s;
  }
  if (Number.isFinite(Number(ctx.tr))) {
    const tr = Math.round(Number(ctx.tr));
    if (tr >= 0 && tr <= 100) payload.tr = tr;
  }
  if (Number.isFinite(Number(ctx.sw))) {
    const sw = Math.round(Number(ctx.sw));
    if (sw >= 0 && sw <= 9999) payload.sw = sw;
  }
  if (!("s" in payload) && !("tr" in payload) && !("sw" in payload)) return null;
  const encoded = jsonToBase64Url(payload);
  return encoded.length <= MAX_CTX_RAW_LEN ? encoded : null;
}

function sanitizeHintFields(o) {
  const out = {};
  if (typeof o.s === "string" && /^[a-zA-Z0-9_-]{1,16}$/.test(o.s)) out.src = o.s;
  if (Number.isFinite(o.tr)) {
    const tr = Math.round(o.tr);
    if (tr >= 0 && tr <= 100) out.tr = tr;
  }
  if (Number.isFinite(o.sw)) {
    const sw = Math.round(o.sw);
    if (sw >= 0 && sw <= 9999) out.sw = sw;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {string} rawCtx
 * @param {string} expectedMint from `?t=`
 * @returns {{ src?: string, tr?: number, sw?: number } | null}
 */
export function parseDeskRadarCtxPayload(rawCtx, expectedMint) {
  if (typeof rawCtx !== "string" || rawCtx.length > MAX_CTX_RAW_LEN) return null;
  if (!expectedMint || !isProbableSolanaMint(expectedMint)) return null;
  let parsed;
  try {
    parsed = JSON.parse(base64UrlToUtf8(rawCtx));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || parsed.v !== CTX_SCHEMA) return null;
  if (typeof parsed.m !== "string" || parsed.m !== expectedMint) return null;
  if (!isProbableSolanaMint(parsed.m)) return null;
  return sanitizeHintFields(parsed);
}

/** @param {Record<string, string | string[] | undefined>} query */
export function parseDeskRadarHintFromQuery(query) {
  const mint = deskMintFromQuery(query);
  if (!mint) return null;
  const rawCtx = firstQueryValue(query?.ctx);
  if (typeof rawCtx !== "string" || !rawCtx.trim()) return null;
  return parseDeskRadarCtxPayload(rawCtx.trim(), mint);
}

function nonEmptyQueryParam(query, key) {
  const v = firstQueryValue(query[key]);
  if (v === undefined || v === null) return false;
  return String(v).trim().length > 0;
}

/**
 * True when `?t=` is a valid mint but no desk hint applies while stale radar
 * params are still on the URL (wrong/corrupt `ctx`, or legacy `src`/`tr`/`sw`).
 * Used to scrub the bar so manual edits cannot leave misleading query junk.
 *
 * @param {Record<string, string | string[] | undefined>} query
 */
export function deskRadarQueryNeedsScrub(query) {
  const mint = deskMintFromQuery(query);
  if (!mint) return false;
  if (parseDeskRadarHintFromQuery(query) != null) return false;
  if (nonEmptyQueryParam(query, "ctx")) return true;
  if (nonEmptyQueryParam(query, "src")) return true;
  if (nonEmptyQueryParam(query, "tr")) return true;
  if (nonEmptyQueryParam(query, "sw")) return true;
  return false;
}

/**
 * Copy of query without radar-only keys (shallow).
 * @param {Record<string, string | string[] | undefined>} query
 */
export function scrubDeskRadarParamsFromQuery(query) {
  const next = { ...query };
  delete next.ctx;
  delete next.src;
  delete next.tr;
  delete next.sw;
  return next;
}

/**
 * Shallow `router.query` for `router.push` when opening the desk from Radar.
 * Preserves unrelated home flags (?foo=…) while replacing `t` and tamper-evident `ctx`.
 * Strips legacy `src`/`tr`/`sw` and any previous `ctx` before applying the new desk state.
 *
 * @param {Record<string, string | string[] | undefined>} query
 * @param {string} mint
 * @param {{ src?: string, tr?: number, sw?: number } | null | undefined} ctx
 * @returns {Record<string, string | string[] | undefined>}
 */
export function mergeDeskMintIntoQuery(query, mint, ctx) {
  if (!mint || !isProbableSolanaMint(mint)) return { ...query };
  const next = scrubDeskRadarParamsFromQuery(query || {});
  next.t = mint;
  const ctxParam = buildDeskRadarCtxParam(mint, ctx);
  if (ctxParam) next.ctx = ctxParam;
  return next;
}
