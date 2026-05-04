import { getPublicApiUrl } from "../../../lib/publicRuntime";

const OPS_COOKIE = "sl_ops_gate";

function opsPagePubliclyEnabled() {
  const v1 = (process.env.NEXT_PUBLIC_OPS_PAGE_ENABLED || "").trim();
  const v2 = (process.env.OPS_PAGE_ENABLED || "").trim();
  return (
    v1 === "1" ||
    v1.toLowerCase() === "true" ||
    v2 === "1" ||
    v2.toLowerCase() === "true"
  );
}

function siteOriginBases() {
  const out = new Set();
  for (const key of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL"]) {
    const raw = process.env[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      out.add(new URL(raw.trim()).origin);
    } catch {
      /* ignore */
    }
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) out.add(`https://${vercel}`);
  if (process.env.NODE_ENV !== "production") out.add("http://localhost:3000");
  return [...out];
}

function sameOriginBrowserRequest(req) {
  const bases = siteOriginBases();
  const referer = String(req.headers.referer || "");
  const origin = String(req.headers.origin || "");
  return bases.some((b) => referer.startsWith(b) || origin === b);
}

function bridgeAllowed(req) {
  const isProd = process.env.NODE_ENV === "production";
  const token = (process.env.OPS_PAGE_GATE_TOKEN || "").trim();

  if (!isProd) {
    if (!token) return true;
    return req.cookies?.[OPS_COOKIE] === token;
  }

  if (token) {
    return req.cookies?.[OPS_COOKIE] === token;
  }
  if (opsPagePubliclyEnabled()) {
    return sameOriginBrowserRequest(req);
  }
  return false;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb"
    },
    responseLimit: false
  }
};

export default async function handler(req, res) {
  const rawUrl = typeof req.url === "string" ? req.url : "";
  const qMark = rawUrl.indexOf("?");
  const pathOnly = qMark >= 0 ? rawUrl.slice(0, qMark) : rawUrl;
  const search = qMark >= 0 ? rawUrl.slice(qMark) : "";

  const prefix = "/api/ops-bridge/";
  const idx = pathOnly.indexOf(prefix);
  if (idx === -1) {
    res.status(500).json({ ok: false, error: "bridge_route" });
    return;
  }
  const rest = pathOnly.slice(idx + prefix.length);
  if (!rest) {
    res.status(400).json({ ok: false, error: "bad_path" });
    return;
  }

  if (!bridgeAllowed(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const opsKey = String(process.env.OMNI_BOT_OPS_KEY || "").trim();
  if (!opsKey) {
    res.status(503).json({ ok: false, error: "ops_key_not_configured" });
    return;
  }

  const backendUrl = `${getPublicApiUrl()}/api/${rest}${search}`;

  const headers = {
    "x-ops-key": opsKey
  };
  const ctIn = req.headers["content-type"];
  if (ctIn) headers["Content-Type"] = ctIn;

  /** @type {RequestInit} */
  const init = {
    method: req.method,
    headers
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body)) {
        init.body = req.body;
      } else if (typeof req.body === "string") {
        init.body = req.body;
      } else if (typeof req.body === "object") {
        init.body = JSON.stringify(req.body);
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      }
    }
  }

  let upstream;
  try {
    upstream = await fetch(backendUrl, init);
  } catch {
    res.status(502).json({ ok: false, error: "upstream_unreachable" });
    return;
  }

  const outCt = upstream.headers.get("content-type") || "";

  if (outCt.includes("application/json")) {
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(text);
    return;
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status);
  const cd = upstream.headers.get("content-disposition");
  if (cd) res.setHeader("Content-Disposition", cd);
  if (outCt) res.setHeader("Content-Type", outCt);
  res.send(buf);
}
