import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f7f9",
        ink: "#18212f",
        muted: "#5b6576",
        line: "#e3e6eb",
        accent: { DEFAULT: "#1f4f7a", soft: "#e8f0f7" },
        // Conflicts: distinct and visible, deliberately not alarm-red.
        review: { DEFAULT: "#5b3fa3", soft: "#f1edfa", line: "#d9cff2" },
        change: { DEFAULT: "#2f6b62", soft: "#e9f4f2", line: "#c4e0da" },
        synth: { DEFAULT: "#8a5a00", soft: "#fff6e0", line: "#f0d9a0" },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Helvetica", "Arial", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
        drawer: "-12px 0 32px rgba(16,24,40,.12)",
      },
    },
  },
  plugins: [],
};

export default config;
