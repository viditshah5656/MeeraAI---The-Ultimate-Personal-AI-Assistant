/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ocean: "#0B1F3A",
        accent: {
          DEFAULT: "var(--accent, #3b82f6)",
          foreground: "var(--accent-foreground, #ffffff)",
        },
        cyan: "#2ED0FF",
        graphite: "#0F172A",
        slateDeep: "#1E293B",
        steel: "#334155",
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        glass: "var(--glass)",
        "glass-strong": "var(--glass-strong)",
        "glass-border": "var(--glass-border)",
      },
      boxShadow: {
        glass: "0 20px 60px rgba(0, 0, 0, 0.35)",
      },
      borderRadius: {
        liquid: "1.4rem",
      },
      backdropBlur: {
        liquid: "30px",
      },
      animation: {
        pulseSoft: "pulseSoft 1.8s ease-in-out infinite",
        rise: "rise 300ms ease-out",
      },
      keyframes: {
        pulseSoft: {
          "0%,100%": { opacity: "0.75", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.12)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
