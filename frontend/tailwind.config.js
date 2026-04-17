/** @type {import('tailwindcss').Config} */
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
