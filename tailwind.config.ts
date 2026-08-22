import type { Config } from "tailwindcss";

/**
 * Colours resolve through CSS variables defined in app/globals.css so that
 * light and dark mode are a single class on <html>, not a rewrite of every
 * className in the app.
 *
 * The `slate` scale is deliberately collapsed to three semantic tiers —
 * high / mid / low contrast — because that is the only way the app ever
 * used it. Keeping the familiar numeric names means no component churn.
 */
const rgb = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          950: rgb("--bg-page"),
          900: rgb("--bg-surface"),
          800: rgb("--bg-raised"),
          700: rgb("--border"),
          600: rgb("--border-strong"),
        },
        slate: {
          50: rgb("--text-hi"),
          100: rgb("--text-hi"),
          200: rgb("--text-hi"),
          300: rgb("--text-mid"),
          400: rgb("--text-mid"),
          500: rgb("--text-lo"),
          600: rgb("--text-lo"),
        },
        accent: {
          400: rgb("--accent-400"),
          500: rgb("--accent-500"),
          600: rgb("--accent-600"),
        },
        emerald: {
          300: rgb("--ok-text"),
          400: rgb("--ok-text"),
          900: rgb("--ok-border"),
          950: rgb("--ok-bg"),
        },
        amber: {
          300: rgb("--warn-text"),
          400: rgb("--warn-text"),
          900: rgb("--warn-border"),
          950: rgb("--warn-bg"),
        },
        red: {
          300: rgb("--err-text"),
          400: rgb("--err-text"),
          700: rgb("--err-border"),
          900: rgb("--err-border"),
          950: rgb("--err-bg"),
        },
        gold: {
          400: rgb("--gold-400"),
          500: rgb("--gold-400"),
        },
      },
    },
  },
  plugins: [],
};
export default config;
