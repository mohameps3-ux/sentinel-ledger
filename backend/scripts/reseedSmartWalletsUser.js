#!/usr/bin/env node
/**
 * One-off: clear wallet_tokens + smart_wallets (and wallet_clusters) then insert known rows.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
 */
require("dotenv").config();
const { getSupabase } = require("../src/lib/supabase");

/** Sincronizado con el bloque SQL más reciente del usuario (20 filas). */
const ROWS = [
  { wallet_address: "xDDHb42oFRQ71pWbwCM4Fqj19WHKxTknMReKy8XUNcg", smart_score: 100, win_rate: 100 },
  { wallet_address: "GXRVaUGMUXe4wsF6qjRyMdNvJ57H7Zw9c2Ddzhqc9Y2Q", smart_score: 99, win_rate: 100 },
  { wallet_address: "628tuaH9DuYK7W36wW6s9aPpwcUcWoropaWWL3HfeS6f", smart_score: 98, win_rate: 100 },
  { wallet_address: "92SZ12mxhQRehyDJuGfxSVvZPK5kGt6J87quRcfpsJcu", smart_score: 97, win_rate: 100 },
  { wallet_address: "Bernard5o8FFRVnjKux3MmSX53u8EMuSDGbhuK69Bpyw", smart_score: 96, win_rate: 100 },
  { wallet_address: "6uhAy6fCfPurNoiA2zFvRnpXVJfcvHB5Ztjujh4qZAof", smart_score: 95, win_rate: 100 },
  { wallet_address: "9mA7ZGAckEFU22EQipMmv8ubidoNwYTFdqf51XjKK1mG", smart_score: 94, win_rate: 100 },
  { wallet_address: "bingo9CZ4v5K4WKVX7oDaBScbzjDwUXfzJwdDaMmYp8", smart_score: 93, win_rate: 97 },
  { wallet_address: "LASTvjDWkbXM1RwUCiniHqGLSEH5xJinDRs56wNPQr9", smart_score: 92, win_rate: 97 },
  { wallet_address: "DoboLsfYFqhiC7SrcdJ7Fogp7axnnf6spRpa21LBQT9Z", smart_score: 91, win_rate: 95 },
  { wallet_address: "6qudAN2kV8mtCcYJxb5QQ6Vr15itdHHdeVbYm99NKMhy", smart_score: 90, win_rate: 93 },
  { wallet_address: "327677XqTEwYxo8kaQxAJUWvUvzpVoSjiMXMc8u4wQS6", smart_score: 89, win_rate: 93 },
  { wallet_address: "CT5WRRtZxsoVRBHc6art6HWrM4azWo4ofuiT853PtJTc", smart_score: 88, win_rate: 91 },
  { wallet_address: "HL8h4ETZ2gfKYLBgpkT8vx2jbMkFPfmkR13g2E69ibq2", smart_score: 87, win_rate: 89 },
  { wallet_address: "AKfjA7dEpb8783fVkgzKdAQKUEucQixnqXaAEFFwvbaM", smart_score: 86, win_rate: 88 },
  { wallet_address: "GRsUN1qXSNDaH7vc3Kj5FfkNncojD54et8Rx6E3XwSng", smart_score: 85, win_rate: 88 },
  { wallet_address: "FRfG5nMXphNWrCzSJzr3WT62EuitqpGfqSztLaXrcLq6", smart_score: 84, win_rate: 87 },
  { wallet_address: "zeronaXJsbvPZFmzytV4RPXWBHQGMFcRCvoYaDNPiRL", smart_score: 83, win_rate: 84 },
  { wallet_address: "YrkmnUv7yZrnWxUaCDeqe3nvKcFittYrCyXRFQdbiP6", smart_score: 82, win_rate: 84 },
  { wallet_address: "C5XTvssTrrpYaqGaC1v9Avc31wkwai74rBnXFBjzRhcU", smart_score: 81, win_rate: 81 }
];

const now = new Date().toISOString();
const toInsert = ROWS.map((r) => ({ ...r, last_seen: now, updated_at: now }));

async function delAll(supabase, table, notNullCol) {
  const { error } = await supabase.from(table).delete().not(notNullCol, "is", null);
  if (error) throw new Error(`${table} delete: ${error.message}`);
}

async function main() {
  const supabase = getSupabase();
  await delAll(supabase, "wallet_tokens", "id");
  await delAll(supabase, "wallet_clusters", "id");
  try {
    await delAll(supabase, "smart_wallets", "wallet_address");
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes("violates foreign key") || msg.includes("23503")) {
      console.error(
        "smart_wallets delete failed (FK from another table). " +
          "In SQL Editor: DELETE FROM <child> that references smart_wallets, then re-run, or use TRUNCATE ... CASCADE in DB."
      );
    }
    throw e;
  }
  const { error: insE } = await supabase.from("smart_wallets").insert(toInsert);
  if (insE) throw new Error(`insert smart_wallets: ${insE.message}`);

  console.log(`OK: ${toInsert.length} rows in smart_wallets, wallet_tokens & wallet_clusters cleared.`);
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exitCode = 1;
});
