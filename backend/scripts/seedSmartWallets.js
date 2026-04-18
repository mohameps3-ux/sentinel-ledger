require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SEED_WALLETS = [
  "7Yv7i7w5wY9hA6x1fTQvW3bM2sG8nR4pKcD1uL5eZ9Qa",
  "4Qn2mV9pR8xL3tH6wZ1cB7kJ5fD9sN2aY8uE4rT6pWvX",
  "9Kd3xP6mR1uT8bW5nL2qH7vC4yF9sA3eZ6pJ1tN8wQmR",
  "3Lp8wQ5nR2vT7mK1xD9sH4bY6uF3cZ8pE5tJ1aN7rVwQ",
  "8Tr1mV6pQ9wL2xH5nB7kD4sY3fC8uR1eZ5aJ9tN2pWmK",
  "5Nq9xR2mW7tL1vH4pD8sB3kY6uF5cZ1eT9aJ4rP8wQnM",
  "2Wp7mQ4nR9xT5vL1hD8sB6kY3fC2uZ9eA4tJ1pN7rVwK",
  "6Rm1xV8pQ3wL7tH2nD9sB4kY5uF6cZ1eT8aJ2pN9wQmR",
  "1Qp8mR5nW2xT9vL4hD7sB3kY6uF1cZ8eA5tJ2rN7wVqM",
  "9Vw2mQ7nR1xT6pL3hD8sB5kY4uF9cZ2eA1tJ7rN6wQmK",
  "4Mr9xV1pQ8wL5tH2nD7sB6kY3uF4cZ9eA2tJ1rN8wQmP",
  "7Kn3mQ8nR5xT1vL4hD9sB2kY6uF7cZ3eA5tJ9rN1wVqM",
  "2Yp6xR9mW4tL8vH1nD7sB5kY3uF2cZ6eA9tJ4rN8wQmK",
  "8Rw1mV5pQ7wL3tH9nD2sB6kY4uF8cZ1eA7tJ5rN3wQmP",
  "3Qm9xR7nW1tL6vH4pD8sB2kY5uF3cZ9eA6tJ1rN7wVqK",
  "6Vp2mQ1nR8xT4vL7hD9sB3kY5uF6cZ2eA8tJ4rN1wQmP",
  "1Rn7xV4pQ9wL2tH5nD8sB6kY3uF1cZ7eA4tJ9rN2wQmK",
  "5Qw3mR8nW6tL1vH9pD2sB7kY4uF5cZ3eA1tJ6rN8wVqM",
  "9Mp1xV6pQ4wL8tH3nD7sB5kY2uF9cZ1eA8tJ3rN6wQmK",
  "2Rk8mQ5nW9tL3vH1pD7sB4kY6uF2cZ8eA5tJ1rN9wVqM"
];

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
