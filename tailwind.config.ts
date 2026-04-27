import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#1B2A4A",
        "blue-accent": "#2E6DA4",
        "bg-main": "#F7F8FA",
        "card-border": "#E2E8F0",
        palermo: "#2E6DA4",
        belgrano: "#10B981",
        puerto: "#8B5CF6",
        "menu-cream": "#FDF8F0",
        "menu-gold": "#c8a45e",
        "menu-gold-light": "#e8d5a8",
        "menu-text": "#3d2e1a",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        japanese: ["Noto Serif JP", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
