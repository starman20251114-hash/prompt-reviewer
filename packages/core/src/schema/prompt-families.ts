import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * プロンプト系列テーブル
 * 同一系統のプロンプトバージョンを束ねる単位を管理する
 */
export const prompt_families = sqliteTable("prompt_families", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name"),
  description: text("description"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export type PromptFamily = typeof prompt_families.$inferSelect;
export type NewPromptFamily = typeof prompt_families.$inferInsert;
