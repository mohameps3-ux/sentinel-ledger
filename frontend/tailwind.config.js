/** @type {import('tailwindcss').Config} */
/* Content globs: include every tree that contains className="" usage (Vercel/CI must resolve paths from this file). */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx,mjs,mdx}",
    "./pages/**/*.{js,jsx,ts,tsx,mjs,mdx}",
    "./components/**/*.{js,jsx,ts,tsx,mjs,mdx}",
    "./hooks/**/*.{js,jsx,ts,tsx,mjs,mdx}",
    "./lib/**/*.{js,jsx,ts,tsx,mjs,mdx}",
    "./src/**/*.{js,jsx,ts,tsx,mjs,mdx}",
    "./styles/**/*.css"
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
