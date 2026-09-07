import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [
    react({
      babel: {
        // Avoid Babel's "deoptimised the styling ... exceeds 500KB" warning
        // for large source files like App.tsx by setting compaction explicitly.
        compact: true,
      },
    }),
  ],
  optimizeDeps: {
    include: ["framer-motion", "react-syntax-highlighter", "three"],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("react-syntax-highlighter") || id.includes("refractor") || id.includes("prism") || id.includes("lowlight") || id.includes("highlight.js")) {
            return "syntax";
          }

          if (id.includes("react-markdown") || id.includes("remark-gfm") || id.includes("mdast") || id.includes("micromark") || id.includes("unist")) {
            return "markdown";
          }

          if (id.includes("framer-motion")) {
            return "motion";
          }

          if (id.includes("three") || id.includes("@react-three")) {
            return "three";
          }

          if (id.includes("firebase")) {
            return "firebase";
          }

          if (id.includes("react-icons")) {
            return "icons";
          }

          if (id.includes("@heyputer/puter.js")) {
            return "puter";
          }

          if (id.includes("wordlist-english") || id.includes("an-array-of-english-words")) {
            return "wordlists";
          }

          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
