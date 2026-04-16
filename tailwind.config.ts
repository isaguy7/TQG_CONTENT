import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        "background-alt": "hsl(var(--background-alt))",
        sidebar: "hsl(var(--sidebar))",
        foreground: "hsl(var(--foreground))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        "muted-foreground-dim": "hsl(var(--muted-foreground-dim))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
          bright: "hsl(var(--primary-bright))",
          soft: "hsl(var(--primary-soft))",
        },
        status: {
          ready: "hsl(var(--status-ready))",
          drafting: "hsl(var(--status-drafting))",
          idea: "hsl(var(--status-idea))",
          published: "hsl(var(--status-published))",
        },
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        arabic: ["var(--font-amiri)", "Amiri", "serif"],
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "5px",
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "1.2" }],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
