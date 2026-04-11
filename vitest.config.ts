import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // テスト時は DB接続を含まないスタブを使用（better-sqlite3 のビルド不要）
      "@prompt-reviewer/core": resolve(__dirname, "packages/core/src/__test-stubs__/index.ts"),
    },
  },
  test: {
    passWithNoTests: true,
    include: ["packages/*/src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.{test,spec}.{ts,tsx}"],
    },
  },
});
