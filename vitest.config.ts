import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{js,ts,jsx,tsx}"],
    exclude: ["node_modules", ".next", "dist"],
    globals: true,
    // Provide required env vars for tests (env.ts validation)
    env: {
      DATABASE_URI: "postgresql://test:test@localhost:5432/test",
      PAYLOAD_SECRET: "test-secret-that-is-at-least-32-characters-long",
      R2_BUCKET: "test-bucket",
      R2_ENDPOINT: "https://test.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "test-access-key",
      R2_SECRET_ACCESS_KEY: "test-secret-key",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@payload-config": path.resolve(__dirname, "./src/payload.config.ts"),
    },
  },
});
