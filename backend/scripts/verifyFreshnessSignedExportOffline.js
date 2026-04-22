#!/usr/bin/env node
"use strict";

/**
 * Offline verifier for signed freshness exports (F4.9 acceptance).
 *
 * Usage:
 *   node scripts/verifyFreshnessSignedExportOffline.js --file "./signed.json"
 *   node scripts/verifyFreshnessSignedExportOffline.js --file "./signed.json" --key-url "https://<backend>/api/v1/public/freshness-export-verification-key"
 *
 * Notes:
 * - Works fully offline when the document includes integrity.publicKeyHex (Ed25519).
 * - If publicKeyHex is missing, pass --key-url to fetch the public verifier key.
 * - For HMAC documents, server secret must exist in local env to validate signature.
 */

const fs = require("fs");
const path = require("path");
const { verifyFreshnessHistorySignedExport, SIG_ED25519 } = require("../src/lib/freshnessSignedExport");

function parseArgs(argv) {
  const out = { file: "", keyUrl: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = String(argv[i] || "");
    if (a === "--file" && argv[i + 1]) {
      out.file = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (a === "--key-url" && argv[i + 1]) {
      out.keyUrl = String(argv[i + 1]);
      i += 1;
      continue;
    }
  }
  return out;
}

async function enrichEd25519KeyIfMissing(doc, keyUrl) {
  const algo = String(doc?.integrity?.signatureAlgorithm || "").toLowerCase();
  if (algo !== SIG_ED25519) return;
  if (String(doc?.integrity?.publicKeyHex || "").trim()) return;
  if (!keyUrl) return;
  const res = await fetch(keyUrl, { method: "GET" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok || !body?.publicKeyHex) {
    throw new Error(`could_not_fetch_public_key (${res.status})`);
  }
  doc.integrity.publicKeyHex = String(body.publicKeyHex);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error("Missing --file argument.");
    process.exit(1);
  }
  const abs = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
  let raw;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch (e) {
    console.error(`Cannot read file: ${abs}`);
    console.error(e?.message || e);
    process.exit(1);
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON file.");
    console.error(e?.message || e);
    process.exit(1);
  }

  try {
    await enrichEd25519KeyIfMissing(doc, args.keyUrl);
  } catch (e) {
    console.error(`Key enrichment failed: ${e?.message || e}`);
    process.exit(1);
  }

  const result = verifyFreshnessHistorySignedExport(doc);
  const out = {
    ok: Boolean(result?.ok),
    valid: Boolean(result?.valid),
    reason: result?.reason || null,
    signatureAlgorithm: result?.signatureAlgorithm || null,
    hashMatches: Boolean(result?.hashMatches),
    proofInputMatches: Boolean(result?.proofInputMatches),
    signatureMatches: Boolean(result?.signatureMatches)
  };
  console.log(JSON.stringify(out, null, 2));

  if (!out.ok || !out.valid) process.exit(2);
  process.exit(0);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

