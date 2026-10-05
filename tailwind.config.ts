import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF9F7",
        surface: "#FFFFFF",
        ink: "#20252B",
        muted: "#59636E",
        line: "#E3E5E8",
        subtle: "#F4F5F6",
        // Brand: primary actions, selected navigation, brand details. Never used for severity.
        brand: { DEFAULT: "#B42336", hover: "#941D2D", soft: "#FFF1F2", line: "#F5C9CF" },
        // Review state (needs a human). Always paired with an icon and a text label.
        review: { DEFAULT: "#8A4B08", soft: "#FFF6E5", line: "#F0D3A1", dot: "#C77A12" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "'Segoe UI'", "system-ui", "-apple-system", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "'Liberation Mono'", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        md: "8px",
        lg: "10px",
        xl: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(32,37,43,.05)",
        raised: "0 4px 16px rgba(32,37,43,.08)",
        drawer: "-16px 0 40px rgba(32,37,43,.14)",
      },
      maxWidth: { reading: "760px" },
    },
  },
  plugins: [],
};

export default config;
