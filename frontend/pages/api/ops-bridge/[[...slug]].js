import { getPublicApiUrl } from "../../../lib/publicRuntime";

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

  const opsKey = String(process.env.OMNI_BOT_OPS_KEY || "").trim();
  if (!opsKey) {
    res.status(503).json({
      ok: false,
      error: "ops_key_not_configured",
      fix: "Set OMNI_BOT_OPS_KEY on Vercel Production and redeploy."
    });
    return;
  }

  const backendUrl = `${getPublicApiUrl()}/api/${rest}${search}`;
  const headers = { "x-ops-key": opsKey };
  const ctIn = req.headers["content-type"];
  if (ctIn) headers["Content-Type"] = ctIn;

  const init = {
    method: req.method,
    headers
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body)) init.body = req.body;
      else if (typeof req.body === "string") init.body = req.body;
      else if (typeof req.body === "object") {
        init.body = JSON.stringify(req.body);
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      }
    }
  }

  let upstream;
  try {
    upstream = await fetch(backendUrl, init);
  } catch (error) {
    res.status(502).json({ ok: false, error: "upstream_unreachable", detail: error?.message || "fetch_failed" });
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
