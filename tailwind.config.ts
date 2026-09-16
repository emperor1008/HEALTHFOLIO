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
        primary: {
          DEFAULT: "#0F5C5E",
          hover: "#134E50",
          dark: "#0A3B3C",
          soft: "#E8F2F1",
        },
        secondary: {
          DEFAULT: "#315E7D",
        },
        sage: {
          DEFAULT: "#EBF1EE",
          surface: "#F4F7F5",
          border: "#D8E2DC",
          hover: "#E1ECE7",
        },
        terracotta: {
          DEFAULT: "#D97757",
          hover: "#C86143",
          soft: "#FDF1EC",
          border: "#F5D5C6",
        },
        accent: {
          DEFAULT: "#D97757",
          hover: "#C86143",
          soft: "#FDF1EC",
        },
        canvas: "#F7F5EF",
        surface: {
          DEFAULT: "#FFFFFF",
          sage: "#F4F7F5",
          muted: "#F9FAF9",
        },
        "text-primary": "#1A2E2B",
        "text-secondary": "#576B66",
        border: "#D8DFDA",
        success: "#18794E",
        warning: "#A15C00",
        error: "#B42318",
        info: "#245EA8",
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
      borderRadius: {
        input: "10px",
        card: "14px",
        sheet: "18px",
      },
      spacing: {
        "44": "44px",
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
