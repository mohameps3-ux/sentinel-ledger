/** @type {import('next').NextConfig} */
const nextConfig = {
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
