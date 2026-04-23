import { NextResponse } from "next/server";

const STATIC_EXT = /\.(ico|png|jpg|jpeg|gif|webp|svg|json|js|map|css|txt|xml|woff2?|ttf|eot|wasm)$/i;

/**
 * Browsers and installed PWAs (display: standalone) can serve a stale first HTML shell;
 * this nudges the CDN/client to revalidate the document (JS chunks stay immutable).
 */
export function proxy(request) {
  const p = request.nextUrl.pathname;
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

export const config = {
  matcher: ["/((?!_next/|_static/|_vercel/|_next/image/|_next/data/).*)", "/"]
};
