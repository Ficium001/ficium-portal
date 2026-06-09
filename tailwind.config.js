/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ficium: {
          DEFAULT: "#2A1FE6",
          deep:    "#1A14A8",
          bright:  "#3D32FF",
        },
        ink:    "#0A0A1A",
        cream:  "#FAF7F0",
        accent: "#FFD84D",
        mint:   "#7DF9C5",
        peach:  "#FF9F7A",
        muted:  "#6B6B85",
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "sans-serif"],
        body:    ["'Inter Tight'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      borderRadius: { pill: "999px" },
      boxShadow: {
        card:   "0 12px 30px rgba(10, 10, 26, 0.08)",
        ficium: "0 12px 32px rgba(42, 31, 230, 0.25)",
      },
      letterSpacing: { display: "-0.035em" },
    },
  },
  plugins: [],
};
