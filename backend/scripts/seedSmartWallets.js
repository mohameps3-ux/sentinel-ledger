require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { isProbableSolanaPubkey } = require("../src/lib/solanaAddress");

const SEED_WALLETS = [
  "zeroDbresTUpHKau1vP4jXrkqtN8Dmh8yuEqyn6GMYh",
  "zeronaXJsbvPZFmzytV4RPXWBHQGMFcRCvoYaDNPiRL",
  "9QwvmJ6KFkmvraqycNGEZe8yAab2bbmU6pFG8WDRjnSh",
  "EqS3FuQ1EQs4V5tfmAKw4JmBDwvVJRyJu3x9vCy1vvtA",
  "DoboLsfYFqhiC7SrcdJ7Fogp7axnnf6spRpa21LBQT9Z",
  "AdmuNy6KJgYa8GoJXDqCknBte57WQEf8khQG9iu9cY5",
  "CT5WRRtZxsoVRBHc6art6HWrM4azWo4ofuiT853PtJTc",
  "327677XqTEwYxo8kaQxAJUWvUvzpVoSjiMXMc8u4wQS6",
  "7moqFjvm2MwAiMtCZoqYoTAPzRBxxMRT2ddyHThQuWjr",
  "JESUSL2s5BsffGNNn6wQtHART2iXVGjtGhKAwGw44bL",
  "8hfoNZCd2bK9aqCBkhg8f2L1AoL7qfHwd9tMv7x64qui",
  "6uhAy6fCfPurNoiA2zFvRnpXVJfcvHB5Ztjujh4qZAof",
  "AKfjA7dEpb8783fVkgzKdAQKUEucQixnqXaAEFFwvbaM",
  "GXRVaUGMUXe4wsF6qjRyMdNvJ57H7Zw9c2Ddzhqc9Y2Q",
  "628tuaH9DuYK7W36wW6s9aPpwcUcWoropaWWL3HfeS6f",
  "xDDHb42oFRQ71pWbwCM4Fqj19WHKxTknMReKy8XUNcg",
  "LASTvjDWkbXM1RwUCiniHqGLSEH5xJinDRs56wNPQr9",
  "bingo9CZ4v5K4WKVX7oDaBScbzjDwUXfzJwdDaMmYp8",
  "GRsUN1qXSNDaH7vc3Kj5FfkNncojD54et8Rx6E3XwSng",
  "4EH92iYK8wua8MyqNExVeiXy5VJUAweXqJPuTWqCvNB8"
];

function assertSeedWallets() {
  const seen = new Set();
  for (const wallet of SEED_WALLETS) {
    if (!isProbableSolanaPubkey(wallet)) throw new Error(`Invalid Solana wallet in SEED_WALLETS: ${wallet}`);
    if (seen.has(wallet)) throw new Error(`Duplicate Solana wallet in SEED_WALLETS: ${wallet}`);
    seen.add(wallet);
  }
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function buildWalletRows(nowIso) {
  return SEED_WALLETS.map((wallet, idx) => {
    const winRate = 72 + (idx % 20);
    const early = 65 + ((idx * 3) % 30);
    const cluster = 60 + ((idx * 5) % 35);
    const consistency = 62 + ((idx * 4) % 30);
    const smartScore = Math.round((winRate * 0.35 + early * 0.25 + cluster * 0.2 + consistency * 0.2) * 100) / 100;
    return {
      wallet_address: wallet,
      win_rate: winRate,
      pnl_30d: 1200 + idx * 180,
      avg_position_size: 900 + idx * 70,
      recent_hits: 2 + (idx % 7),
      total_trades: 40 + idx * 2,
      profitable_trades: 28 + idx,
      early_entry_score: early,
      cluster_score: cluster,
      consistency_score: consistency,
      smart_score: smartScore,
      last_seen: nowIso,
      updated_at: nowIso
    };
  });
}

function buildTokenRows() {
  const now = Date.now();
  const mint = "So11111111111111111111111111111111111111112";
  return SEED_WALLETS.map((wallet, idx) => ({
    wallet_address: wallet,
    token_address: mint,
    tx_signature: `seed-tx-${idx + 1}`,
    amount_usd: 800 + idx * 95,
    bought_at: new Date(now - idx * 15 * 60 * 1000).toISOString()
  }));
}

async function main() {
  assertSeedWallets();
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();
  const walletRows = buildWalletRows(nowIso);
  const tokenRows = buildTokenRows();

  const { error: walletsError } = await supabase
    .from("smart_wallets")
    .upsert(walletRows, { onConflict: "wallet_address" });
  if (walletsError) throw walletsError;

  const { error: tokensError } = await supabase
    .from("wallet_tokens")
    .upsert(tokenRows, { onConflict: "wallet_address,token_address,tx_signature" });
  if (tokensError) throw tokensError;

  console.log(`OK: seeded ${walletRows.length} smart_wallets and ${tokenRows.length} wallet_tokens rows.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
