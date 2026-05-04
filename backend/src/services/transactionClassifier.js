"use strict";

// ─── DEX Program IDs ───────────────────────────────────────────
// NOTE: These are the most commonly seen IDs in parsed transactions.
// If your RPC returns different IDs for the same protocol,
// add them here. Check your actual tx accountKeys in production
// and update this set as needed.
const DEX_PROGRAMS = new Set([
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium AMM v4
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", // Raydium CLMM
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", // Raydium CPMM
  "RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr", // Raydium v3 (alt)
  "6EF8rrecthR5Dkzon8Nwu78hRvfCs1pXk6uNEcgC9rB8", // Pump.fun bonding
  "BSfD6SHZigAfDWSjzD5Q41jw8LmKwtmjskPH9XW1mrRW", // Pump.fun AMM
  "JUP6LkbZbjS1jKKwapdH67yX8H5Bq8g9qYpG8Vb79Jk", // Jupiter v6
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", // Jupiter v4
  "JUP3c2Uh3WA4Ng34tw6kPd2G4PxDaFV83YLcCmDV8", // Jupiter v3
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3sFjatV", // Orca Whirlpool
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP", // Orca v1
  "LBUZKhRxPF3XUpBCjp4YzTKgLLjLsRiqiivzKmAAv", // Meteora DLMM
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5Ekucamy", // Meteora dynamic
  "MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2pgJe" // Mercurial
]);

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbequnT9kHJS3TNS39gLypBVEHEZXt6BLe";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bfd";

// ─── Stats (call getClassifierStats() from /health) ──────────
// In-memory counters since process start; incremented once per distinct tx object
// (WeakMap cache avoids double-counting when classifyTransaction runs twice on the same tx).
const _stats = { SWAP: 0, LP: 0, TRANSFER: 0, WRAP: 0, AIRDROP: 0, UNKNOWN: 0 };

/** Keys exposed via getClassifierStats() (WRAP included — classifyTransaction emits it). */
const STATS_KEYS = ["SWAP", "LP", "TRANSFER", "WRAP", "AIRDROP", "UNKNOWN"];
const _classified = new WeakMap(); // cache result per tx object

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Extract ALL program IDs from a transaction:
 * top-level accountKeys + all instructions + all innerInstructions.
 * This is critical for Jupiter/aggregator routing where the real
 * DEX program only appears in inner CPI calls.
 */
function extractProgramIds(tx) {
  const ids = new Set();
  try {
    const message = tx?.transaction?.message || {};

    // Account keys (includes all programs referenced)
    (message.accountKeys || []).forEach((k) => {
      const s = typeof k === "string" ? k : k.pubkey?.toString?.() || "";
      if (s) ids.add(s);
    });

    // Top-level instructions
    (message.instructions || []).forEach((ix) => {
      const pid = ix.programId?.toString?.() || ix.program || "";
      if (pid) ids.add(pid);
      if (ix.programId) ids.add(ix.programId.toString());
    });

    // Inner instructions — where Jupiter routes DEX programs
    (tx?.meta?.innerInstructions || []).forEach((block) => {
      (block.instructions || []).forEach((ix) => {
        const pid = ix.programId?.toString?.() || ix.program || "";
        if (pid) ids.add(pid);
      });
    });
  } catch (_) {}
  return ids;
}

/**
 * Detect LP operation using both log messages (fast heuristic)
 * AND parsed instruction types (stronger signal).
 * Both are heuristics — neither is definitive alone.
 * We require at least one to fire.
 */
function detectLP(tx, programIds) {
  if (![...programIds].some((p) => DEX_PROGRAMS.has(p))) return false;

  // Signal 1: log messages (fast but can be truncated)
  const logs = tx?.meta?.logMessages || [];
  const logStr = logs.join(" ").toLowerCase();
  const lpKeywords = [
    "addliquidity",
    "removeliquidity",
    "withdraw liquidity",
    "add_liquidity",
    "remove_liquidity"
  ];
  const lpInLogs = lpKeywords.some((k) => logStr.includes(k));

  // Signal 2: parsed instruction type (more reliable)
  const message = tx?.transaction?.message || {};
  const allIx = [
    ...(message.instructions || []),
    ...(tx?.meta?.innerInstructions || []).flatMap((b) => b.instructions || [])
  ];
  const lpTypes = new Set([
    "addliquidity",
    "removeliquidity",
    "deposit",
    "withdrawliquidity",
    "add_liquidity",
    "remove_liquidity"
  ]);
  const lpInIx = allIx.some((ix) => {
    const t = (ix.parsed?.type || ix.type || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    return lpTypes.has(t);
  });

  return lpInLogs || lpInIx;
}

/**
 * Collect top-level + inner instructions (same shape as detectLP).
 * @param {object} tx
 * @returns {object[]}
 */
function allInstructionsFlat(tx) {
  const message = tx?.transaction?.message || {};
  return [
    ...(message.instructions || []),
    ...(tx?.meta?.innerInstructions || []).flatMap((b) => b.instructions || [])
  ];
}

/**
 * SOL wrap / unwrap — logs ("wrap sol" / "unwrap sol") or SPL-Token transfer of wSOL mint.
 * Checked before DEX / transfer heuristics so WRAP is never labeled SWAP or TRANSFER.
 */
function isWrapOrUnwrap(tx) {
  try {
    const logs = tx?.meta?.logMessages || [];
    const logStr = logs.join(" ").toLowerCase();
    if (logStr.includes("wrap sol") || logStr.includes("unwrap sol")) return true;

    for (const ix of allInstructionsFlat(tx)) {
      const pid = ix.programId?.toString?.() || ix.program || "";
      if (pid !== TOKEN_PROGRAM) continue;
      const typ = String(ix.parsed?.type || "").toLowerCase();
      if (typ !== "transfer") continue;
      const mint = ix.parsed?.info?.mint ?? ix.parsed?.info?.tokenMint ?? "";
      if (String(mint) === WSOL_MINT) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Detect airdrop / spam:
 * - No DEX program involved (already checked by caller)
 * - Token balance increased somewhere
 * - Only System/Token/ATA programs involved (no market action)
 * NOTE: Does NOT use feePayerIdx — the fee payer is typically
 * the airdrop bot, not the receiving wallet.
 */
function detectAirdrop(tx, programIds) {
  const pre = tx?.meta?.preTokenBalances || [];
  const post = tx?.meta?.postTokenBalances || [];

  const tokenIncreased = post.some((p) => {
    const before = pre.find((x) => x.accountIndex === p.accountIndex);
    return Number(p.uiTokenAmount?.amount || 0) > Number(before?.uiTokenAmount?.amount || 0);
  });
  if (!tokenIncreased) return false;

  // Only safe/known programs → no market action
  const safePrograms = new Set([SYSTEM_PROGRAM, TOKEN_PROGRAM, TOKEN_2022, ATA_PROGRAM]);
  const unknownPrograms = [...programIds].filter((p) => !safePrograms.has(p) && p.length > 10);
  return unknownPrograms.length === 0;
}

// ─── Main classifier ─────────────────────────────────────────

/**
 * Classify a parsed Solana transaction.
 * Returns: 'SWAP' | 'LP' | 'TRANSFER' | 'WRAP' | 'AIRDROP' | 'UNKNOWN'
 *
 * Uses a WeakMap cache so multiple calls with the same tx object
 * do not inflate _stats counters.
 */
function classifyTransaction(tx) {
  try {
    if (!tx || !tx.transaction) return "UNKNOWN";

    // Priority: native SOL wrap/unwrap (before general cache read / DEX / SPL transfer branch).
    // Still bump stats once per tx object via _classified.
    if (isWrapOrUnwrap(tx)) {
      if (!_classified.has(tx)) {
        _classified.set(tx, "WRAP");
        _stats.WRAP = (_stats.WRAP || 0) + 1;
      }
      return "WRAP";
    }

    if (_classified.has(tx)) return _classified.get(tx);

    const programIds = extractProgramIds(tx);
    const hasDex = [...programIds].some((p) => DEX_PROGRAMS.has(p));

    let result;

    if (hasDex && detectLP(tx, programIds)) {
      result = "LP";
    } else if (hasDex) {
      result = "SWAP";
    } else {
      if (detectAirdrop(tx, programIds)) {
        result = "AIRDROP";
      } else if (programIds.has(TOKEN_PROGRAM) || programIds.has(TOKEN_2022)) {
        result = "TRANSFER";
      } else {
        result = "UNKNOWN";
      }
    }

    _classified.set(tx, result);
    _stats[result] = (_stats[result] || 0) + 1;
    return result;
  } catch (e) {
    console.warn("[tx-classifier] error:", e?.message);
    return "UNKNOWN";
  }
}

/**
 * Returns true only for real market swaps.
 */
function isRealTrade(tx) {
  return classifyTransaction(tx) === "SWAP";
}

/**
 * Snapshot of classifier counts since process start.
 * @returns {{ SWAP: number, LP: number, TRANSFER: number, WRAP: number, AIRDROP: number, UNKNOWN: number }}
 */
function getClassifierStats() {
  const out = {};
  for (const k of STATS_KEYS) {
    out[k] = Number(_stats[k] || 0);
  }
  return out;
}

module.exports = { classifyTransaction, isRealTrade, getClassifierStats };
