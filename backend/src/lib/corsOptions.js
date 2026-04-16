/**
 * CORS for REST + Socket.IO. Set ALLOWED_ORIGINS=comma,separated,urls
 * or leave unset: dev = permissive; prod = Vercel production + *.vercel.app previews.
 */
function isOriginAllowed(origin) {
  if (!origin) return true;

  const raw = process.env.ALLOWED_ORIGINS;
  if (raw && raw !== "*") {
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return list.includes(origin);
  }

  if (process.env.NODE_ENV !== "production") return true;

  try {
    const { hostname } = new URL(origin);
    if (hostname === "sentinel-ledger-ochre.vercel.app") return true;
    if (hostname.endsWith(".vercel.app")) return true;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  } catch (_) {
    return false;
  }
  return false;
}

const corsMiddlewareOptions = {
  origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
  credentials: true
};

const socketIoCors = {
  origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
  credentials: true,
  methods: ["GET", "POST"]
};

module.exports = { corsMiddlewareOptions, socketIoCors, isOriginAllowed };
