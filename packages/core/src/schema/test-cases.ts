import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./projects.js";

/**
 * テストケーステーブル
 * システムプロンプトを評価するためのマルチターン入力ケースを管理する
 */
export const test_cases = sqliteTable("test_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project_id: integer("project_id")
    .notNull()
    .references(() => projects.id),
  turns: text("turns").notNull(),
  context_refs: text("context_refs").notNull().default("[]"),
  expected_description: text("expected_description"),
  created_at: integer("created_at").notNull(),
});

// Drizzle推論型のエクスポート
export type TestCase = typeof test_cases.$inferSelect;
export type NewTestCase = typeof test_cases.$inferInsert;
