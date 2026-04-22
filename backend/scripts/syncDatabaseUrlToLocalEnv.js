/**
 * One-shot: if backend/.env has no DATABASE_URL / SUPABASE_DATABASE_URL,
 * fill DATABASE_URL from (in order):
 *   1) process.env (e.g. `railway run npm run db:sync-database-url-from-railway`)
 *   2) `railway variable list --json` when run locally with a linked Railway project
 *
 * Railway CLI runs on your machine; this script writes `backend/.env` on disk.
 * Do not commit secrets; run locally only when needed.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const envPath = path.join(__dirname, "..", ".env");

function hasNonEmptyDbUrl(src) {
  const m = src.match(/^DATABASE_URL=(.*)$/m);
  if (m && String(m[1] || "").trim()) return true;
  const m2 = src.match(/^SUPABASE_DATABASE_URL=(.*)$/m);
  if (m2 && String(m2[1] || "").trim()) return true;
  return false;
}

function parseDbUrlFromRailwayJson(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  // Some CLI versions wrap rows as { variables: [ { name, value } ] }.
  if (parsed.variables && Array.isArray(parsed.variables)) {
    const inner = parseDbUrlFromRailwayJson(parsed.variables);
    if (inner) return inner;
  }
  if (Array.isArray(parsed)) {
    for (const row of parsed) {
      const n = String(row?.name || row?.key || "").trim();
      if (n === "DATABASE_URL" || n === "SUPABASE_DATABASE_URL") {
        const v = String(row?.value ?? row?.val ?? "").trim();
        if (v) return v;
      }
    }
    return null;
  }
  const u1 = String(parsed.DATABASE_URL || "").trim();
  if (u1) return u1;
  const u2 = String(parsed.SUPABASE_DATABASE_URL || "").trim();
  if (u2) return u2;
  return null;
}

function execRailwayVariableListJson() {
  const args = ["variable", "list", "--json"];
  const svc = String(process.env.RAILWAY_SERVICE || process.env.RAILWAY_SERVICE_NAME || "").trim();
  const envName = String(process.env.RAILWAY_ENVIRONMENT || "").trim();
  if (svc) args.push("-s", svc);
  if (envName) args.push("-e", envName);

  const tryBins = process.platform === "win32" ? ["railway.cmd", "railway.exe", "railway"] : ["railway"];
  /** Always run Railway from `backend/` so linking works when invoked via `npm --prefix backend`. */
  const backendRoot = path.join(__dirname, "..");

  let lastErr = null;
  for (const bin of tryBins) {
    try {
      const out = execFileSync(bin, args, {
        encoding: "utf8",
        maxBuffer: 12 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: backendRoot,
        // Windows: global `railway` is usually a `.cmd` shim; CreateProcess cannot exec it without a shell (EINVAL).
        shell: process.platform === "win32"
      });
      const raw = String(out || "").trim();
      const jsonText = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      return JSON.parse(jsonText);
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

function resolveUrlFromRailwayCli() {
  try {
    const parsed = execRailwayVariableListJson();
    return parseDbUrlFromRailwayJson(parsed);
  } catch (_) {
    return null;
  }
}

function main() {
  let text = "";
  try {
    text = fs.readFileSync(envPath, "utf8");
  } catch {
    console.error("Missing backend/.env — create it first (copy from .env.example).");
    process.exit(1);
  }

  if (hasNonEmptyDbUrl(text)) {
    console.log("backend/.env already has a non-empty DATABASE_URL or SUPABASE_DATABASE_URL — nothing to do.");
    process.exit(0);
  }

  let url = String(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "").trim();
  let source = "environment";

  if (!url) {
    url = String(resolveUrlFromRailwayCli() || "").trim();
    source = "railway variable list --json";
  }

  if (!url) {
    console.error(
      "Could not resolve DATABASE_URL.\n" +
        "  • Option A: cd backend && railway run npm run db:sync-database-url-from-railway\n" +
        "  • Option B: from repo root with backend linked to Railway:\n" +
        "      npm run db:sync-database-url-from-railway --prefix backend\n" +
        "    (uses `railway variable list --json` with cwd=backend/; same machine, writes backend/.env)\n" +
        "  • Option C: set DATABASE_URL or SUPABASE_DATABASE_URL in backend/.env manually."
    );
    process.exit(1);
  }

  const needsQuotes = /["\s#]/.test(url);
  const line = needsQuotes ? `DATABASE_URL="${url.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : `DATABASE_URL=${url}`;

  let next = text;
  if (/^DATABASE_URL=\s*$/m.test(next) || /^DATABASE_URL=$/m.test(next)) {
    next = next.replace(/^DATABASE_URL=\s*$/m, line);
  } else if (/^SUPABASE_DATABASE_URL=\s*$/m.test(next) || /^SUPABASE_DATABASE_URL=$/m.test(next)) {
    next = next.replace(
      /^SUPABASE_DATABASE_URL=\s*$/m,
      `SUPABASE_DATABASE_URL=${needsQuotes ? `"${url.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : url}`
    );
  } else {
    next += `\n# Synced for local migrations (${source})\n${line}\n`;
  }
  fs.writeFileSync(envPath, next, "utf8");
  console.log(`Updated backend/.env with DATABASE_URL (source: ${source}).`);
}

main();
