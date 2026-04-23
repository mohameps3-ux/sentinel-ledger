#!/usr/bin/env node
/**
 * Confirma de forma no interactiva que /api/v1/smart-wallets/top tendrá filas
 * cuando la lógica de `buildSmartWalletsTop` pueda alimentarlas.
 *
 * Modo A (por defecto): misma lógica que el endpoint — `buildSmartWalletsTop` vía service role.
 * Modo B: `--url <base>` p.ej. http://localhost:3000 — HTTP GET (servidor en marcha).
 *
 *   npm run verify:smart-wallets-top
 *   node scripts/verifySmartWalletsTop.js --url http://127.0.0.1:3000
 */
require("dotenv").config();
const { getSupabase } = require("../src/lib/supabase");
const { buildSmartWalletsTop } = require("../src/services/homeTerminalApi");

function argUrl() {
  const i = process.argv.indexOf("--url");
  if (i < 0 || !process.argv[i + 1]) return null;
  return String(process.argv[i + 1]).replace(/\/$/, "");
}

async function httpVerify(base) {
  const u = new URL("/api/v1/smart-wallets/top", base);
  u.searchParams.set("limit", "4");
  const t0 = Date.now();
  const r = await fetch(u.toString(), { headers: { accept: "application/json" } });
  const ms = Date.now() - t0;
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    console.log(`HTTP ${r.status} in ${ms}ms — body not JSON, first 200 chars:`);
    console.log(text.slice(0, 200));
    return r.ok ? 0 : 1;
  }
  const n = (Array.isArray(j?.data) && j.data.length) || (Array.isArray(j?.rows) && j.rows.length) || 0;
  const src = j?.meta?.source;
  const cache = j?.meta?.cache;
  console.log(`[HTTP] ${r.status} in ${ms}ms  rows=${n}  source=${src ?? "—"}  cache=${cache ?? "—"}`);
  if (n > 0) {
    const a = (j.data || j.rows || [])[0];
    const addr = a?.walletAddress || a?.address || "";
    console.log(`[HTTP] first sample: ${addr ? `${String(addr).slice(0, 6)}…${String(addr).slice(-4)}` : "(no address)"}  WR ${a?.winRate ?? "—"}`);
  }
  return n > 0 ? 0 : 1;
}

async function directVerify() {
  const supabase = getSupabase();

  const { count: cSw, error: eSw } = await supabase.from("smart_wallets").select("*", { count: "exact", head: true });
  if (eSw) console.warn("[counts] smart_wallets:", eSw.message);
  else console.log(`[counts] smart_wallets rows: ${cSw ?? 0}`);

  const { count: cR, error: eR } = await supabase
    .from("smart_wallet_signals")
    .select("id", { count: "exact", head: true })
    .not("result_pct", "is", null);
  if (eR) console.warn("[counts] smart_wallet_signals (result_pct not null):", eR.message);
  else console.log(`[counts] smart_wallet_signals with result_pct: ${cR ?? 0}`);

  const payload = await buildSmartWalletsTop(supabase, { limit: 8 });
  const n = Array.isArray(payload.data) ? payload.data.length : 0;
  const src = payload.meta?.source;
  console.log(`[build] ok=${payload.ok} rows=${n} source=${src ?? "—"}`);

  if (n > 0) {
    const a = payload.data[0];
    const addr = a?.walletAddress || a?.address || "";
    console.log(
      `[build] first: ${addr ? `${String(addr).slice(0, 6)}…${String(addr).slice(-4)}` : "—"}  ` +
        `winRate=${a?.winRate}  smartScore=${a?.smartScore ?? a?.signalStrength}`
    );
  } else {
    console.log(
      "[build] empty — añade `smart_wallets` (p.ej. npm run seed:terminal-home) o señales con `result_pct` " +
        "en `smart_wallet_signals` (mín. 2 por wallet) para rellenar vía agregado."
    );
  }

  return n > 0 ? 0 : 1;
}

async function main() {
  const base = argUrl();
  if (base) {
    const code = await httpVerify(base);
    process.exitCode = code;
    return;
  }
  try {
    const code = await directVerify();
    process.exitCode = code;
  } catch (e) {
    console.error("FAIL:", e.message || e);
    console.error("Tip: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or use --url with the API running.");
    process.exitCode = 1;
  }
}

main();
