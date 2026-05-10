import { NextResponse } from "next/server";

const STATIC_EXT = /\.(ico|png|jpg|jpeg|gif|webp|svg|json|js|map|css|txt|xml|woff2?|ttf|eot|wasm)$/i;

const OPS_COOKIE = "sl_ops_gate";
const OPS_KEY_COOKIE = "sentinel_ops_gate";

/** Incluye buildId y, si hubiera i18n, el locale: .../ops.json */
function isOpsNextDataJson(pathname) {
  return pathname.includes("/_next/data/") && /\/ops\.json$/.test(pathname);
}

function isOpsDocumentRequest(pathname) {
  return pathname === "/ops" || pathname.startsWith("/ops/");
}

/** Legacy: abre /ops a cualquiera en producción si está en "1"/"true". */
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

function opsGateToken() {
  return (process.env.OPS_PAGE_GATE_TOKEN || "").trim();
}

function hasBrowserOpsKey(request) {
  return Boolean(request.cookies.get(OPS_KEY_COOKIE)?.value);
}

/**
 * /ops en producción:
 * - Si OPS_PAGE_GATE_TOKEN está definido → SIEMPRE puerta (?ops_gate= o cookie). Ignora flags “legacy” públicos.
 * - Si no hay token: modo legacy con NEXT_PUBLIC_OPS_PAGE_ENABLED / OPS_PAGE_ENABLED → /ops abierto.
 * - Sin token ni legacy → redirección a /.
 */
export function proxy(request) {
  const p = request.nextUrl.pathname;
  const isProd = process.env.NODE_ENV === "production";

  const needsOpsGate = isOpsDocumentRequest(p) || isOpsNextDataJson(p);

  if (needsOpsGate) {
    if (!isProd) {
      // next dev: siempre accesible
    } else {
      const token = opsGateToken();
      if (token) {
        const q = request.nextUrl.searchParams.get("ops_gate");
        const cookie = request.cookies.get(OPS_COOKIE)?.value;
        if (q === token) {
          if (isOpsNextDataJson(p)) {
            const res = NextResponse.next();
            res.cookies.set(OPS_COOKIE, token, {
              httpOnly: true,
              secure: true,
              sameSite: "lax",
              maxAge: 60 * 60 * 24 * 90,
              path: "/"
            });
            return res;
          }
          const clean = request.nextUrl.clone();
          clean.searchParams.delete("ops_gate");
          const res = NextResponse.redirect(clean);
          res.cookies.set(OPS_COOKIE, token, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 90,
            path: "/"
          });
          return res;
        }
        if (cookie === token) {
          return NextResponse.next();
        }
        if (isOpsNextDataJson(p)) {
          return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/ops-login", request.url));
      }
      if (opsPagePubliclyEnabled() || hasBrowserOpsKey(request)) {
        // producción legacy: /ops abierto (solo si NO hay OPS_PAGE_GATE_TOKEN)
      } else {
        if (isOpsNextDataJson(p)) {
          return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/ops-login", request.url));
      }
    }
  }

  if (p.startsWith("/_next/") || p.startsWith("/_static/") || p.startsWith("/_vercel") || p.startsWith("/api/")) {
    return NextResponse.next();
  }
  if (STATIC_EXT.test(p)) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  return res;
}

/**
 * Incluye /_next/data (antes excluido): si no, el _next/data/.../ops.json de navegación cliente nunca pasaba por el proxy.
 * Excluye solo chunks estáticos e imágenes para no añadir latencia a assets.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|_static|_vercel|api/).*)", "/"]
};
