import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * プロジェクトテーブル
 * システムプロンプト改善の作業単位を管理する
 */
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

/**
 * プロジェクト設定テーブル
 * プロジェクトごとのLLM設定を管理する（APIキーは別管理）
 */
export const project_settings = sqliteTable("project_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project_id: integer("project_id")
    .notNull()
    .references(() => projects.id)
    .unique(),
  model: text("model").notNull().default("claude-opus-4-5"),
  temperature: real("temperature").notNull().default(0.7),
  api_provider: text("api_provider", { enum: ["anthropic", "openai"] })
    .notNull()
    .default("anthropic"),
  max_tokens: integer("max_tokens"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

// Drizzle推論型のエクスポート
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectSettings = typeof project_settings.$inferSelect;
export type NewProjectSettings = typeof project_settings.$inferInsert;
