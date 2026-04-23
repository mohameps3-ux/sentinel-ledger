/**
 * Frees localhost ports Next usually binds to, so `clean-next` can remove `.next\\dev`
 * and no stale Turbopack/webpack dev keeps files locked (Windows).
 */
const { execSync } = require("child_process");

const ports = [3000, 3001, 3002];

if (process.platform === "win32") {
  const ps = ports
    .map(
      (p) =>
        `Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
    )
    .join("; ");
  try {
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "ignore" });
    console.log("kill-next-ports: attempted", ports.join(", "));
  } catch (_) {
    console.log("kill-next-ports: skip (no admin / no listeners)");
  }
} else {
  for (const p of ports) {
    try {
      execSync(`lsof -ti:${p} | xargs kill -9 2>/dev/null`, { shell: "/bin/bash", stdio: "ignore" });
    } catch (_) {
      /* ignore */
    }
  }
  console.log("kill-next-ports: attempted", ports.join(", "));
}
