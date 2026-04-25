#!/usr/bin/env node
/**
 * Imprime 20 `wallet_address` de `smart_wallets` (orden: smart_score, win_rate, last_seen)
 * filtrando EXCLUDE (coma-separado). Para Helius: copiar salida al campo "Accounts".
 *
 *   Excluye por defecto el program Raydium AMM v4 (mainnet). Más: HELIUS_WEBHOOK_EXCLUDE=Addr1,Addr2
 *   node scripts/listHeliusWebhookAccounts.js
 *   node scripts/listHeliusWebhookAccounts.js --json
 */
require("dotenv").config();
const { getSupabase } = require("../src/lib/supabase");

const TAKE = 20;
/** Filas a pedir; si excluyes muchas, sube o amplía vía .limit() */
const PREFETCH = 200;

/** Mainnet Raydium AMM v4 program — not a “smart wallet”; skip if it appears in DB. */
const DEFAULT_EXCLUDE = new Set(["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"]);

function parseExclude() {
  const raw = process.env.HELIUS_WEBHOOK_EXCLUDE || "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_EXCLUDE, ...fromEnv]);
}

async function main() {
  const json = process.argv.includes("--json");
  const supabase = getSupabase();
  const exclude = parseExclude();

  const { data, error } = await supabase
    .from("smart_wallets")
    .select("wallet_address, smart_score, win_rate, last_seen")
    .order("smart_score", { ascending: false, nullsFirst: false })
    .order("win_rate", { ascending: false, nullsFirst: false })
    .order("last_seen", { ascending: false, nullsFirst: true })
    .limit(PREFETCH);

  if (error) throw new Error(error.message);
  if (!data || !data.length) {
    console.error("No hay filas en smart_wallets. Rellena datos o usa seed:terminal-home.");
    process.exitCode = 1;
    return;
  }

  const out = [];
  for (const r of data) {
    const w = (r.wallet_address || "").trim();
    if (!w) continue;
    if (exclude.has(w)) continue;
    out.push(w);
    if (out.length >= TAKE) break;
  }

  if (out.length < TAKE) {
    console.error(
      `Solo ${out.length} cuentas tras excluir (${exclude.size} en HELIUS_WEBHOOK_EXCLUDE).`
    );
  }

  if (json) {
    console.log(JSON.stringify(out, null, 0));
  } else {
    for (const a of out) console.log(a);
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  console.error("Tip: crea backend/.env con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exitCode = 1;
});
