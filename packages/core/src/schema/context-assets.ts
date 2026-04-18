import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * コンテキスト素材テーブル
 * テストケースやプロンプト系列で再利用するテキスト資産を管理する
 */
export const context_assets = sqliteTable("context_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  content: text("content").notNull(),
  mime_type: text("mime_type").notNull(),
  content_hash: text("content_hash"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export type ContextAsset = typeof context_assets.$inferSelect;
export type NewContextAsset = typeof context_assets.$inferInsert;
