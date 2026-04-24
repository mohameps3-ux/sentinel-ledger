/**
 * Node smoke tests for deskRadarCtx (mismatch m/t, legacy scrub, corrupt ctx, merge preserves flags).
 * Run: npm run test:desk-radar-ctx --prefix frontend
 */
import assert from "node:assert/strict";
import {
  buildDeskRadarCtxParam,
  deskMintFromQuery,
  deskRadarQueryNeedsScrub,
  mergeDeskMintIntoQuery,
  parseDeskRadarCtxPayload,
  parseDeskRadarHintFromQuery
} from "../lib/deskRadarCtx.mjs";

const M_SOL = "So11111111111111111111111111111111111111112";
const M_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// --- build + parse roundtrip ---
const ctxParam = buildDeskRadarCtxParam(M_SOL, { src: "radar", tr: 72, sw: 12 });
assert.ok(ctxParam && ctxParam.length > 0);
const parsed = parseDeskRadarCtxPayload(ctxParam, M_SOL);
assert.deepEqual(parsed, { src: "radar", tr: 72, sw: 12 });
const fromQuery = parseDeskRadarHintFromQuery({ t: M_SOL, ctx: ctxParam });
assert.deepEqual(fromQuery, parsed);

// --- embedded m must match ?t= (tamper) ---
assert.equal(parseDeskRadarCtxPayload(ctxParam, M_USDC), null);
assert.equal(parseDeskRadarHintFromQuery({ t: M_USDC, ctx: ctxParam }), null);
assert.equal(deskRadarQueryNeedsScrub({ t: M_USDC, ctx: ctxParam }), true);

// --- legacy loose params without valid ctx → scrub ---
assert.equal(
  deskRadarQueryNeedsScrub({ t: M_SOL, src: "hot", tr: "99" }),
  true,
  "legacy src/tr without ctx should scrub"
);

// --- corrupt ctx while mint valid ---
assert.equal(parseDeskRadarHintFromQuery({ t: M_SOL, ctx: "not-valid-base64!!!" }), null);
assert.equal(deskRadarQueryNeedsScrub({ t: M_SOL, ctx: "not-valid-base64!!!" }), true);

// --- merge preserves unrelated query keys; strips legacy; sets t + ctx ---
const merged = mergeDeskMintIntoQuery(
  { mode: "war", foo: "bar", src: "legacy", tr: "1", t: "oldShouldBeReplaced" },
  M_SOL,
  { src: "radar", tr: 5 }
);
assert.equal(merged.mode, "war");
assert.equal(merged.foo, "bar");
assert.equal(merged.t, M_SOL);
assert.equal(merged.src, undefined);
assert.equal(merged.tr, undefined);
assert.ok(typeof merged.ctx === "string" && merged.ctx.length > 0);

// --- merge without ctx payload (no radar metadata) still clears legacy and sets t ---
const mergedBare = mergeDeskMintIntoQuery({ t: M_USDC, src: "x", sw: "2" }, M_SOL, null);
assert.equal(mergedBare.t, M_SOL);
assert.equal(mergedBare.ctx, undefined);
assert.equal(mergedBare.src, undefined);

// --- deskMintFromQuery ---
assert.equal(deskMintFromQuery({ t: M_SOL }), M_SOL);
assert.equal(deskMintFromQuery({ t: "bad" }), null);

console.log("OK: deskRadarCtx tests passed");
