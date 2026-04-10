import { type AnySQLiteColumn, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  model: text("model").notNull().default("claude-opus-4-5"),
  temperature: real("temperature").notNull().default(0.7),
  api_key: text("api_key"),
  created_at: integer("created_at").notNull(),
});

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

export const prompt_versions = sqliteTable("prompt_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project_id: integer("project_id")
    .notNull()
    .references(() => projects.id),
  version: integer("version").notNull(),
  name: text("name"),
  memo: text("memo"),
  content: text("content").notNull(),
  parent_version_id: integer("parent_version_id").references(
    (): AnySQLiteColumn => prompt_versions.id,
  ),
  created_at: integer("created_at").notNull(),
});

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
});
