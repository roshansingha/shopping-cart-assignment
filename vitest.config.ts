import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig uses jsx: "preserve" for Next; tests need the transform applied.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node", // logic tests; component tests opt in with // @vitest-environment jsdom
    setupFiles: ["src/test/setup.tsx"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "review/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Next route files are thin glue exercised by Playwright; test helpers are not product code.
      exclude: ["src/**/*.test.*", "src/test/**", "src/app/layout.tsx", "src/app/site-header.tsx"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // The money-handling core is held to a stricter bar than UI glue.
        "src/features/cart/logic.ts": { lines: 95, functions: 95, branches: 95, statements: 95 },
        "src/features/cart/persistence.ts": {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
        "src/features/products/query.ts": {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95,
        },
      },
    },
  },
});
