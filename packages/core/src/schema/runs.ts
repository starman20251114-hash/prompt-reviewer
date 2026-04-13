import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./projects";
import { prompt_versions } from "./prompt-versions";
import { test_cases } from "./test-cases";

/**
 * 実行結果テーブル
 * プロンプトバージョン×テストケースの実行結果を管理する（複数回保持）
 *
 * conversation: JSON文字列として保存するマルチターン会話 [{role, content}]
 * is_best: 同一バージョン×ケースの複数実行のうち、最良と判断した回答フラグ
 */
export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project_id: integer("project_id")
    .notNull()
    .references(() => projects.id),
  prompt_version_id: integer("prompt_version_id")
    .notNull()
    .references(() => prompt_versions.id),
  test_case_id: integer("test_case_id")
    .notNull()
    .references(() => test_cases.id),
  conversation: text("conversation").notNull(),
  is_best: integer("is_best", { mode: "boolean" }).notNull().default(false),
  created_at: integer("created_at").notNull(),
  // 実行時設定スナップショット（project_settings からコピー）
  model: text("model").notNull(),
  temperature: real("temperature").notNull(),
  api_provider: text("api_provider").notNull(),
});

// Drizzle推論型のエクスポート
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

/**
 * conversationカラムのJSONスキーマ型
 * text型で保存されるため、アプリケーション側でパース/シリアライズを行う
 */
export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
