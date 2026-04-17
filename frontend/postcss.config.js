const path = require("path");

module.exports = {
  plugins: {
    // Pin scan root to this app so Tailwind v4 finds class names even if process.cwd() differs (e.g. monorepo / CI).
    "@tailwindcss/postcss": {
      base: path.resolve(__dirname)
    }
  }
};

