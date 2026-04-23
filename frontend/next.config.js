/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Baked at build; inspect `<nav data-sentinel-build="…">` in DevTools to confirm the live deploy. */
  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local"
  },
  /**
   * Installed PWA (manifest display: standalone) often reuses a cached document
   * shell; home is dynamic but HTML can still look “stuck” on old JS. Force
   * revalidation for `/` so cockpit updates ship to users without stale bundles.
   */
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=0, must-revalidate"
          }
        ]
      }
    ];
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.svg",
        permanent: true
      }
    ];
  }
};

module.exports = nextConfig;
