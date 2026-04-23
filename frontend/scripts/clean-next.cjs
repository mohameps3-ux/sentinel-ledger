/**
 * Deletes `.next` so the next `next dev` / `next build` cannot reuse a stale bundle.
 * On Windows, stop `next dev` first if you see ENOTEMPTY / EBUSY.
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", ".next");

async function main() {
  const opts = { recursive: true, force: true, maxRetries: 12, retryDelay: 150 };
  for (let i = 0; i < 4; i++) {
    try {
      await fs.promises.rm(dir, opts);
      console.log("clean-next: removed", dir);
      return;
    } catch (e) {
      if (e && e.code === "ENOENT") {
        console.log("clean-next: nothing to remove");
        return;
      }
      if (i === 3) {
        console.error("clean-next: could not remove .next — stop `next dev` and retry.", e.message || e);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
