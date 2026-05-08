import { getPublicApiUrl } from "../../../lib/publicRuntime";

function getOpsKey(req) {
  const serverKey = String(process.env.OMNI_BOT_OPS_KEY || "").trim();
  if (serverKey) return serverKey;
  const headerKey = String(req.headers["x-ops-key"] || "").trim();
  if (process.env.NODE_ENV !== "production" && headerKey) return headerKey;
  return "";
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "4mb" },
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

  if (idx === -1) return res.status(500).json({ ok: false, error: "bridge_route" });
  const rest = pathOnly.slice(idx + prefix.length);
  if (!rest) return res.status(400).json({ ok: false, error: "bad_path" });

  const opsKey = getOpsKey(req);
  if (!opsKey) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });

  const backendUrl = `${getPublicApiUrl()}/api/${rest}${search}`;
  const headers = { "x-ops-key": opsKey };
  const ctIn = req.headers["content-type"];
  if (ctIn) headers["Content-Type"] = ctIn;

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD" && req.body != null) {
    if (Buffer.isBuffer(req.body) || typeof req.body === "string") init.body = req.body;
    else if (typeof req.body === "object") {
      init.body = JSON.stringify(req.body);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
  }

  let upstream;
  try {
    upstream = await fetch(backendUrl, init);
  } catch {
    return res.status(502).json({ ok: false, error: "upstream_unreachable" });
  }

  const outCt = upstream.headers.get("content-type") || "";
  const cd = upstream.headers.get("content-disposition");
  if (cd) res.setHeader("Content-Disposition", cd);
  if (outCt) res.setHeader("Content-Type", outCt);

  if (outCt.includes("application/json")) {
    const text = await upstream.text();
    return res.status(upstream.status).send(text);
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  return res.status(upstream.status).send(buf);
}
