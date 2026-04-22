/**
 * One-shot: if backend/.env has no DATABASE_URL / SUPABASE_DATABASE_URL,
 * fill it from the current process env.
 *
 * Typical use: `cd backend && railway run npm run db:sync-database-url-from-railway`
 * Railway CLI runs the command **on your machine** and injects service env vars —
 * this script then writes disk file `backend/.env` (not a remote container filesystem).
 *
 * Do not commit secrets; run locally only when needed.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
const url = String(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "").trim();
if (!url) {
  console.error("No DATABASE_URL or SUPABASE_DATABASE_URL in environment (use: railway run node scripts/syncDatabaseUrlToLocalEnv.js)");
  process.exit(1);
}
let text = "";
try {
  text = fs.readFileSync(envPath, "utf8");
} catch {
  console.error("Missing backend/.env");
  process.exit(1);
}

function hasNonEmptyDbUrl(src) {
  const m = src.match(/^DATABASE_URL=(.*)$/m);
  if (m && String(m[1] || "").trim()) return true;
  const m2 = src.match(/^SUPABASE_DATABASE_URL=(.*)$/m);
  if (m2 && String(m2[1] || "").trim()) return true;
  return false;
}

if (hasNonEmptyDbUrl(text)) {
  console.log("backend/.env already has a non-empty DATABASE_URL or SUPABASE_DATABASE_URL — nothing to do.");
  process.exit(0);
}

const needsQuotes = /["\s#]/.test(url);
const line = needsQuotes ? `DATABASE_URL="${url.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : `DATABASE_URL=${url}`;

// Replace empty placeholders, or append if no line exists.
let next = text;
if (/^DATABASE_URL=\s*$/m.test(next) || /^DATABASE_URL=$/m.test(next)) {
  next = next.replace(/^DATABASE_URL=\s*$/m, line);
} else if (/^SUPABASE_DATABASE_URL=\s*$/m.test(next) || /^SUPABASE_DATABASE_URL=$/m.test(next)) {
  next = next.replace(/^SUPABASE_DATABASE_URL=\s*$/m, `SUPABASE_DATABASE_URL=${needsQuotes ? `"${url.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : url}`);
} else {
  next += `\n# Synced from Railway for local migrations (scripts/syncDatabaseUrlToLocalEnv.js)\n${line}\n`;
}
fs.writeFileSync(envPath, next, "utf8");
console.log("Updated backend/.env with DATABASE_URL from Railway.");
