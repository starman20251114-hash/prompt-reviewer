import { type AnySQLiteColumn, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./projects";
import { prompt_families } from "./prompt-families";

export const prompt_versions = sqliteTable("prompt_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  prompt_family_id: integer("prompt_family_id")
    .notNull()
    .references(() => prompt_families.id),
  project_id: integer("project_id").references(() => projects.id),
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
