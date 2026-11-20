/**
 * `pnpm --filter @prompt-reviewer/core migrate` で drizzle-kit migrate の後に実行する（#211）。
 * DB_PATH の解決は drizzle.config.ts と同じ（既定値 ../../dev.db、作業ディレクトリ基準）。
 */
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { repairSkippedMigrations } from "./skipped-migrations-repair";
import { resolveSqliteFilePath } from "./sqlite-path";

const dbFilePath = resolveSqliteFilePath(process.env.DB_PATH ?? "../../dev.db", process.cwd());

if (!existsSync(dbFilePath)) {
  console.error(`[repair #211] DB ファイルが見つかりません: ${dbFilePath}`);
  process.exit(1);
}

const sqlite = new Database(dbFilePath);
try {
  const { actions } = repairSkippedMigrations(sqlite);
  if (actions.length === 0) {
    console.log("[repair #211] 修復が必要なスキーマの欠落はありません");
  } else {
    for (const action of actions) console.log(`[repair #211] ${action}`);
  }
} catch (error) {
  console.error(`[repair #211] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  sqlite.close();
}
