// Execra Platform
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
    "coverage/**",
    "contracts/**",
    "docs/**",
    "feedback doc/**",
    "node_modules/**",
    "public/**",
    "scripts/**",
    "supabase/**",
    "projects/**",
    "next-env.d.ts",
    "*.config.*",
    "*.mjs",
  ]),
]);

export default eslintConfig;
