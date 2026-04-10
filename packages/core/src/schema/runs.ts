import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { prompt_versions } from "./prompt-versions";
import { test_cases } from "./test-cases";

/**
 * 実行結果テーブル
 * プロンプトバージョン×テストケースの実行結果を管理する（複数回保持）
 */
export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  prompt_version_id: integer("prompt_version_id")
    .notNull()
    .references(() => prompt_versions.id),
  test_case_id: integer("test_case_id")
    .notNull()
    .references(() => test_cases.id),
  conversation: text("conversation").notNull(),
  is_best: integer("is_best").notNull().default(0),
  human_score: integer("human_score"),
  human_comment: text("human_comment"),
  is_discarded: integer("is_discarded").notNull().default(0),
  created_at: integer("created_at").notNull(),
  // 実行時設定スナップショット（project_settings からコピー）
  model: text("model").notNull(),
  temperature: real("temperature").notNull(),
  api_provider: text("api_provider").notNull(),
});

// Drizzle推論型のエクスポート
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
