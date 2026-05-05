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
    // The default vmThreads pool reuses workers across files and leaks
    // jsdom contexts, OOM'ing the suite on CI runners. Forks pool +
    // sequential files keeps peak heap bounded to one jsdom context at
    // a time. Slower locally but the only configuration that completes
    // reliably end-to-end (every test passes; the OOM that occasionally
    // tails the run is in cleanup, after the summary prints).
    pool: "forks",
    fileParallelism: false,
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
