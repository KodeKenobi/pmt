import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f5f5f7",
          100: "#e5e7eb",
          200: "#e5e7eb",
          300: "#9ca3af",
          400: "#4a4a4a",
          500: "#1b2a4a",
          600: "#1b2a4a",
          700: "#0f1e38",
          800: "#0f1e38",
          900: "#0f1e38",
          950: "#0f1419",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 15, 18, 0.05), 0 1px 3px rgba(15, 15, 18, 0.08)",
        "card-hover":
          "0 4px 12px rgba(15, 15, 18, 0.07), 0 2px 4px rgba(15, 15, 18, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
