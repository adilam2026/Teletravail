import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f5ff",
          100: "#dce6ff",
          200: "#b8ccff",
          300: "#8ea9ff",
          400: "#6685f5",
          500: "#4a63e0",
          600: "#3a4dc2",
          700: "#2f3d9c",
          800: "#293477",
          900: "#242c5c",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
        elevated: "0 4px 12px rgba(16, 24, 40, 0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
