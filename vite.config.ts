import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("react-router")) return "vendor-react";
            if (id.includes("@tanstack"))                                  return "vendor-query";
            if (id.includes("@supabase"))                                  return "vendor-supabase";
            if (id.includes("lucide") || id.includes("react-hook-form") || id.includes("zod")) return "vendor-ui";
          }
        },
      },
    },
  },
});
