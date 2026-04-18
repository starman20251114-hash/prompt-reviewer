import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * 実行設定テーブル
 * Run 実行時に参照するモデル設定を独立資産として管理する
 */
export const execution_profiles = sqliteTable("execution_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  model: text("model").notNull().default("claude-opus-4-5"),
  temperature: real("temperature").notNull().default(0.7),
  api_provider: text("api_provider", { enum: ["anthropic", "openai"] })
    .notNull()
    .default("anthropic"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export type ExecutionProfile = typeof execution_profiles.$inferSelect;
export type NewExecutionProfile = typeof execution_profiles.$inferInsert;
