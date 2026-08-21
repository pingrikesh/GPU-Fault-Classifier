/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#05070d",
          900: "#0a0e17",
          850: "#0e1320",
          800: "#131a2b",
          700: "#1b2438",
          600: "#263148",
          500: "#37456350",
        },
        accent: {
          cyan: "#22d3ee",
          violet: "#a78bfa",
          emerald: "#34d399",
          amber: "#fbbf24",
          rose: "#fb7185",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px -6px rgba(34, 211, 238, 0.35)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(0.8)", opacity: "0.8" },
          "80%, 100%": { transform: "scale(1.8)", opacity: "0" },
        },
        tooltipIn: {
          "0%": { opacity: "0", transform: "scale(0.96) translateY(2px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        pulseRing: "pulseRing 1.6s cubic-bezier(0.4,0,0.6,1) infinite",
        tooltipIn: "tooltipIn 120ms cubic-bezier(0.16,1,0.3,1)",
      },
    },
  },
  plugins: [],
};
