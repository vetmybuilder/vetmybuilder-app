// vitest.web.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Only web tests here
    include: ["tests/web/**/*.spec.tsx", "tests/web/**/*.test.tsx"],
    exclude: ["tests/server/**", "node_modules/**", "dist/**"],
    setupFiles: ["tests/web/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      // so "@/utils/auth" etc resolve from /web
      "@": path.resolve(__dirname, "web"),
    },
  },
  esbuild: {
    // ensure JSX works without "import React from 'react'"
    jsx: "automatic",
    jsxDev: true,
    // extra safety in case some TS/JS file still expects React in scope
    jsxInject: `import React from 'react'`,
  },
});
