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
  },
  /**
   * In `next dev --webpack`, a persistent Webpack cache can make it look like
   * layout edits “don’t apply” until `.next` is wiped. Disabling the cache in
   * dev only trades a bit of compile speed for reliable HMR.
   */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  }
};

module.exports = nextConfig;
