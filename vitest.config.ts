// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Only pick up server tests here
    include: [
      "tests/server/**/*.spec.ts",
      "tests/server/**/*.test.ts",
    ],
    exclude: [
      "tests/web/**",
      "node_modules/**",
      "dist/**",
    ],
    globals: true,
    reporters: "default",
  },
});
