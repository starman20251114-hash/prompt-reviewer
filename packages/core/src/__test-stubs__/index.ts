/**
 * テスト用スタブ: @prompt-reviewer/core のスキーマ型定義のみをエクスポート
 * DB接続（better-sqlite3）を含む client.ts はエクスポートしない。
 * vitest.config.ts のエイリアスでこのファイルを指定することで、
 * ネイティブバイナリのビルドエラーを回避する。
 */
export * from "../schema/index.js";
export * from "../llm/index.js";

// DBインスタンスを引数で受け取る関数（better-sqlite3 は型としてのみ参照する）
export { inspectSchema } from "../db/schema-inspection.js";
export {
  SkippedMigrationsRepairError,
  repairSkippedMigrations,
} from "../db/skipped-migrations-repair.js";
export { resolveSqliteFilePath } from "../db/sqlite-path.js";

// DB型のみエクスポート（実際のDBインスタンスは含まない）
export type { DB } from "../db/client.js";
