import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * テストケーステーブル
 * システムプロンプトを評価するためのマルチターン入力ケースを管理する
 * プロジェクトへの所属は中間テーブル test_case_projects で管理する
 *
 * turns: JSON文字列として保存するマルチターン会話 [{role, content}]
 * context_content: {{context}} プレースホルダーに挿入するテキスト
 */
export const test_cases = sqliteTable("test_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  turns: text("turns").notNull(),
  context_content: text("context_content").notNull().default(""),
  expected_description: text("expected_description"),
  display_order: integer("display_order").notNull().default(0),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

// Drizzle推論型のエクスポート
export type TestCase = typeof test_cases.$inferSelect;
export type NewTestCase = typeof test_cases.$inferInsert;

/**
 * turnsカラムのJSONスキーマ型
 * text型で保存されるため、アプリケーション側でパース/シリアライズを行う
 */
export type Turn = {
  role: "user" | "assistant";
  content: string;
};
