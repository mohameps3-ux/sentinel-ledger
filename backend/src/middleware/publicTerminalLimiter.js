const rateLimit = require("express-rate-limit");

function computePublicTerminalMax() {
  const raw = Number(process.env.PUBLIC_TERMINAL_RATE_LIMIT_MAX);
  if (Number.isFinite(raw) && raw >= 50) return Math.min(5000, Math.floor(raw));
  /** Default: track-record polls burst several `/signals/*` calls per IP. */
  return 600;
}

const PUBLIC_TERMINAL_MAX = computePublicTerminalMax();

/** `PUBLIC_TERMINAL_RATE_LIMIT_MAX` (default 600) req / 15 min per IP — signals + public terminal routes. */
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: PUBLIC_TERMINAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limit_exceeded" }
});
