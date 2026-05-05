// vitest.web.config.mts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup/jsdom.setup.ts"],
    include: ["tests/web/**/*.test.ts", "tests/web/**/*.test.tsx"],
    globals: true,
    css: true,
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web", import.meta.url)),
    },
  },
  esbuild: {
    jsx: "automatic", // ⬅️ fixes "React is not defined"
  },
});
