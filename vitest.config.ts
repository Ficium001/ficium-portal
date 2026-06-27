/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Separate from vite.config so the build stays lean; shares the @ alias.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Dummy values so modules that construct the Supabase client at import
    // time don't throw in DEV during tests. Never used for real requests.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
      VITE_PORTAL_API_URL: "http://localhost:8000",
      VITE_FICIUM_AUTH_URL: "http://localhost:8001",
    },
  },
});
