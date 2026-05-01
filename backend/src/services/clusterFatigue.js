"use strict";

/** In-memory bookkeeping for cluster-linked emissions (non-persistent, best-effort). */
const lastEmitByAsset = new Map();

function registerClusterSignal(asset, wallets) {
  const a = String(asset || "").trim();
  if (!a) return;
  const ws = Array.isArray(wallets) ? wallets.filter(Boolean).map(String) : [];
  lastEmitByAsset.set(a, { at: Date.now(), wallets: ws });
}

function getLastClusterEmit(asset) {
  const a = String(asset || "").trim();
  if (!a) return null;
  return lastEmitByAsset.get(a) || null;
}

module.exports = { registerClusterSignal, getLastClusterEmit };
