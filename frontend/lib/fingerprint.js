/**
 * Canvas-derived fingerprint (no PII sent raw; only SHA-256 hex server-side with IP / trial logic).
 * @returns {Promise<string|null>} 64-char hex prefix
 */
export async function getCanvasFingerprint() {
  if (typeof window === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Sentinel", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Ledger", 4, 17);
    const raw = canvas.toDataURL() + (navigator.userAgent || "").substring(0, 100);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 64);
  } catch {
    return null;
  }
}
