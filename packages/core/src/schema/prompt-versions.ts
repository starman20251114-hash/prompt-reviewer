import { type AnySQLiteColumn, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./projects";
import { prompt_families } from "./prompt-families";

/**
 * プロンプトバージョンテーブル
 * システムプロンプトのバージョン履歴を管理する（分岐・メモ付き）
 */
export const prompt_versions = sqliteTable("prompt_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // 互換期間中は project_id と併存し、後続 Issue で prompt_family_id を必須化する。
  prompt_family_id: integer("prompt_family_id").references(() => prompt_families.id),
  project_id: integer("project_id")
    .notNull()
    .references(() => projects.id),
  version: integer("version").notNull(),
  name: text("name"),
  memo: text("memo"),
  content: text("content").notNull(),
  workflow_definition: text("workflow_definition"),
  parent_version_id: integer("parent_version_id").references(
    (): AnySQLiteColumn => prompt_versions.id,
  ),
  created_at: integer("created_at").notNull(),
  is_selected: integer("is_selected", { mode: "boolean" }).notNull().default(false),
});

// Drizzle推論型のエクスポート
export type PromptVersion = typeof prompt_versions.$inferSelect;
export type NewPromptVersion = typeof prompt_versions.$inferInsert;

export type PromptExecutionStepDefinition = {
  id: string;
  title: string;
  prompt: string;
};

export type PromptWorkflowDefinition = {
  steps: PromptExecutionStepDefinition[];
};
