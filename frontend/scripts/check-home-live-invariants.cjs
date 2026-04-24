/**
 * Fails the build if War Home / Live anti-flicker invariants are regressed
 * (comments removed, useRankingSnapshot wired in index, visibleTrending in index merge, or hysteresis removed).
 * Run: node scripts/check-home-live-invariants.cjs (from frontend/)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexPath = path.join(root, "pages", "index.js");
const liveTabPath = path.join(root, "src", "features", "war-home", "tabs", "LiveTab.jsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}
function mustPathExists(p, label) {
  if (!fs.existsSync(p)) {
    err(
      `${label} not found at ${p} — Vercel Root Directory must be the frontend/ folder (contains pages/ and src/). ` +
        `If this is the monorepo root, set Project → Settings → Root Directory to "frontend" (not frontend/frontend).`
    );
  }
}

let failed = false;
function err(msg) {
  console.error(`[check-home-live-invariants] ${msg}`);
  failed = true;
}

mustPathExists(indexPath, "pages/index.js");
mustPathExists(liveTabPath, "LiveTab.jsx");
if (failed) process.exit(1);
let index;
let live;
try {
  index = read(indexPath);
  live = read(liveTabPath);
} catch (e) {
  err(`read failed: ${e.message}`);
  process.exit(1);
}

/**
 * Coarse comment strip (good enough for this file) so we can forbid *code* patterns
 * while keeping explanatory // comments that name the old pitfall.
 */
function stripHashLineComments(s) {
  return s
    .split("\n")
    .map((line) => {
      const q1 = line.indexOf("'//");
      const j = line.indexOf("//");
      if (j < 0) return line;
      if (j === 0 || /\s$/.test(line.slice(0, j))) {
        // naive: not inside string
        if (line.indexOf("'") < j && line.indexOf("'", j) > j) return line;
        return line.slice(0, j);
      }
      return line;
    })
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}
const indexCode = stripHashLineComments(index);

// --- index.js: forbidden *code* patterns (comments may still name the pitfall for reviewers)
// No lookbehind: some CI/Node regex engines reject (?<!
const badImport = /(?:import|from|require\()[^;]*\buseRankingSnapshot\b/.test(indexCode);
const badCall = /(?:^|[^.$\w])useRankingSnapshot\s*\(/.test(indexCode);
if (badImport || badCall) {
  err("pages/index.js must not import or call useRankingSnapshot (whole-grid flicker).");
}
if (/\b(?:const|let|var)\s+visibleTrending\b|=\s*visibleTrending|visibleTrending\s*[,;)]\s*[,}=]/.test(indexCode)) {
  err("pages/index.js must not add a separate visibleTrending for Live; use the same `trending` from useLastGoodArray for hot-fill.");
}

// --- index.js: required doc markers (deleting the comments re-enables regression risk)
const needIndex = [
  "No useRankingSnapshot here",
  "Hysteresis: toggling",
  "setUseLiveVirtualized",
  "liveN > 50",
  "liveN < 42"
];
for (const s of needIndex) {
  if (!index.includes(s)) {
    err(`pages/index.js must keep stability marker/line including: ${JSON.stringify(s)}`);
  }
}

// --- LiveTab: test ids for optional E2E + PR smoke
if (!live.includes("data-testid=\"sl-war-live-section\"") || !live.includes("data-testid=\"sl-war-live-card\"")) {
  err("LiveTab.jsx must expose data-testid sl-war-live-section and sl-war-live-card (see anti-regression PR checklist).");
}

if (failed) {
  process.exit(1);
}
console.log("check-home-live-invariants: ok");
process.exit(0);
