import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    ".next-*/**",
    "playwright-report/**",
    "test-results/**",
    // Deliberately flawed code for the review exercise (review/CODE_REVIEW.md).
    "review/examples/*.before.tsx",
  ]),
]);

export default eslintConfig;
