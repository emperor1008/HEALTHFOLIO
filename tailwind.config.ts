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
          hover: "#176D6F",
          soft: "#DDEEEE",
        },
        secondary: {
          DEFAULT: "#315E7D",
        },
        accent: {
          DEFAULT: "#D97757",
        },
        canvas: "#F7F5EF",
        surface: "#FFFFFF",
        "text-primary": "#1F2933",
        "text-secondary": "#5F6B76",
        border: "#D9DEE3",
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
