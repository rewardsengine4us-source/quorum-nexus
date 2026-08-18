import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#05060a",
          900: "#0b0e16",
          800: "#121627",
          700: "#1b2035",
        },
        accent: {
          400: "#7dd3fc",
          500: "#38bdf8",
          600: "#0ea5e9",
        },
        gold: {
          400: "#facc15",
          500: "#eab308",
        },
      },
    },
  },
  plugins: [],
};
export default config;
