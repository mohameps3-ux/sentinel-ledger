/**
 * Fails if the slim header / Vercel deploy contract is broken in the tree.
 * Stops "forgot to git add" or accidental removal of bundle markers from shipping.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) {
    errors.push(`Missing file: ${rel}`);
  }
}

function mustInclude(rel, substr, desc) {
  if (errors.some((e) => e.startsWith("Missing file"))) return;
  try {
    const s = read(rel);
    if (!s.includes(substr)) {
      errors.push(`${rel}: must ${desc} (expected fragment: ${JSON.stringify(substr)})`);
    }
  } catch (e) {
    errors.push(`Cannot read ${rel}: ${e.message}`);
  }
}

mustExist("vercel.json");
mustInclude("next.config.js", "NEXT_PUBLIC_GIT_SHA", "inject NEXT_PUBLIC_GIT_SHA for production stamp");
mustInclude("components/layout/Navbar.jsx", 'data-sl-nav="slim"', "set data-sl-nav=\"slim\" on <nav> for bundle verification");
mustInclude("components/layout/Navbar.jsx", 'data-sl-ui="home-compact-v2"', "set data-sl-ui revision on <nav> (DevTools: stale bundle if missing)");
mustInclude("components/layout/Navbar.jsx", "data-sentinel-build", "set data-sentinel-build on <nav>");
mustInclude("components/layout/Navbar.jsx", "NEXT_PUBLIC_GIT_SHA", "pass NEXT_PUBLIC_GIT_SHA to the build stamp");

if (errors.length) {
  console.error("check-deploy-contract failed:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log("check-deploy-contract: ok (vercel.json + data-sl-nav + data-sl-ui + data-sentinel-build)");
