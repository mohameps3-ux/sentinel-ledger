const axios = require("axios");
const { Connection, PublicKey, clusterApiUrl } = require("@solana/web3.js");
const { persistDonationAndRewards } = require("./donationService");

const DEFAULT_INTERVAL_MS = 30_000;
let timer = null;
let running = false;

function getRpcUrl() {
  if (process.env.DONATION_MONITOR_RPC_URL) return process.env.DONATION_MONITOR_RPC_URL;
  if (process.env.HELIUS_KEY) return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`;
  return clusterApiUrl("mainnet-beta");
}

async function fetchSolPriceUsd() {
  try {
    const { data } = await axios.get("https://price.jup.ag/v4/price?ids=SOL", { timeout: 5000 });
    return Number(data?.data?.SOL?.price || 0);
  } catch {
    return 0;
  }
}

function extractDonationTransfer(parsedTx, donationWallet) {
  const instructions = [];
  const topLevel = parsedTx?.transaction?.message?.instructions || [];
  const inner = parsedTx?.meta?.innerInstructions || [];
  instructions.push(...topLevel);
  for (const bucket of inner) {
    if (Array.isArray(bucket?.instructions)) instructions.push(...bucket.instructions);
  }

  let selected = null;
  for (const ix of instructions) {
    const info = ix?.parsed?.info;
    const type = ix?.parsed?.type;
    if (type !== "transfer" || !info) continue;
    if (info.destination !== donationWallet) continue;
    const lamports = Number(info.lamports || 0);
    if (lamports <= 0) continue;
    if (!selected || lamports > selected.lamports) {
      selected = {
        fromWallet: info.source,
        lamports
      };
    }
  }
  return selected;
}

async function scanOnce(connection, donationWallet) {
  const donationPubkey = new PublicKey(donationWallet);
  const signatures = await connection.getSignaturesForAddress(donationPubkey, { limit: 25 }, "confirmed");
  if (!Array.isArray(signatures) || !signatures.length) return;

  const solPrice = await fetchSolPriceUsd();
  const ordered = signatures.slice().reverse();
  for (const sig of ordered) {
    const txHash = sig.signature;
    const parsedTx = await connection.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });
    if (!parsedTx) continue;

    const donationTransfer = extractDonationTransfer(parsedTx, donationWallet);
    if (!donationTransfer?.fromWallet) continue;

    const amountSol = donationTransfer.lamports / 1_000_000_000;
    const amountUsd = solPrice > 0 ? amountSol * solPrice : 0;

    try {
      await persistDonationAndRewards({
        txHash,
        fromWallet: donationTransfer.fromWallet,
        amountSol,
        amountUsd,
        occurredAt: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : new Date().toISOString()
      });
    } catch (error) {
      // Ignore duplicate tx_hash races and continue polling.
      if (!String(error?.message || "").toLowerCase().includes("duplicate")) {
        console.error("donation monitor persist:", error.message || error);
      }
    }
  }
}

function startDonationMonitor() {
  const donationWallet = process.env.DONATION_WALLET_SOLANA;
  if (!donationWallet) {
    console.warn("Donation monitor disabled: DONATION_WALLET_SOLANA missing.");
    return null;
  }

  const intervalMs = Number(process.env.DONATION_MONITOR_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const connection = new Connection(getRpcUrl(), "confirmed");
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await scanOnce(connection, donationWallet);
    } catch (error) {
      console.error("donation monitor scan:", error.message || error);
    } finally {
      running = false;
    }
  }, Math.max(10_000, intervalMs));

  scanOnce(connection, donationWallet).catch((error) =>
    console.error("donation monitor initial scan:", error.message || error)
  );

  return timer;
}

module.exports = { startDonationMonitor };
