/** @type {import('tailwindcss').Config} */

/**
 * Ficium Portal — design tokens.
 * Single source of truth for the 2026 revamp ("N26/Revolut" direction).
 * Change a value here and the whole portal follows.
 */
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
        // Revamp palette
        ink:    "#0B0B1E",   // near-black, slight blue
        paper:  "#FAFAFC",   // app canvas
        line:   "#ECECF2",   // hairline borders
        muted:  "#6B6B85",
        good:   "#0FA47A",
        warn:   "#E8930C",
        bad:    "#E5484D",
        // Logo gradient stops (blue blade / purple blade)
        gblue:  { from: "#1E6CF5", to: "#0B3FD6", cyan: "#06B6D4" },
        gpurple:{ from: "#7C3AED", to: "#C026D3" },
        // Legacy (kept so old pages don't break)
        cream:  "#FAF7F0",
        accent: "#FFD84D",
        mint:   "#7DF9C5",
        peach:  "#FF9F7A",
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "sans-serif"],
        body:    ["'Inter Tight'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      borderRadius: {
        pill: "999px",
        card: "20px",
        hero: "28px",
      },
      boxShadow: {
        card:   "0 1px 2px rgba(11,11,30,.04), 0 8px 24px rgba(11,11,30,.05)",
        lift:   "0 2px 4px rgba(11,11,30,.06), 0 16px 40px rgba(42,31,230,.12)",
        ficium: "0 8px 24px rgba(124,58,237,.35)",
      },
      letterSpacing: { display: "-0.035em" },
      transitionTimingFunction: {
        swift: "cubic-bezier(.22,1,.36,1)",
      },
      keyframes: {
        pulseRing: {
          "0%":   { boxShadow: "0 0 0 0 rgba(192,38,211,.45)" },
          "70%":  { boxShadow: "0 0 0 8px rgba(192,38,211,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(192,38,211,0)" },
        },
        pulseRingGreen: {
          "0%":   { boxShadow: "0 0 0 0 rgba(15,164,122,.45)" },
          "70%":  { boxShadow: "0 0 0 8px rgba(15,164,122,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(15,164,122,0)" },
        },
        drift: {
          from: { transform: "translate3d(0,0,0) rotate(0deg)" },
          to:   { transform: "translate3d(-30px,22px,0) rotate(-6deg)" },
        },
        fadeSlide: {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-ring":       "pulseRing 2.4s infinite",
        "pulse-ring-green": "pulseRingGreen 2.4s infinite",
        drift:              "drift 14s ease-in-out infinite alternate",
        "fade-slide":       "fadeSlide .25s ease-out",
      },
    },
  },
  plugins: [],
};
