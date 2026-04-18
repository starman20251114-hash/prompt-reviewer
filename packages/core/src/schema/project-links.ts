import { integer, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { context_assets } from "./context-assets";
import { projects } from "./projects";
import { prompt_families } from "./prompt-families";
import { prompt_versions } from "./prompt-versions";
import { test_cases } from "./test-cases";

/**
 * テストケースとラベルの関連
 */
export const test_case_projects = sqliteTable(
  "test_case_projects",
  {
    test_case_id: integer("test_case_id")
      .notNull()
      .references(() => test_cases.id),
    project_id: integer("project_id")
      .notNull()
      .references(() => projects.id),
    created_at: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.test_case_id, table.project_id] })],
);

/**
 * プロンプトバージョンとラベルの関連
 */
export const prompt_version_projects = sqliteTable(
  "prompt_version_projects",
  {
    prompt_version_id: integer("prompt_version_id")
      .notNull()
      .references(() => prompt_versions.id),
    project_id: integer("project_id")
      .notNull()
      .references(() => projects.id),
    created_at: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.prompt_version_id, table.project_id] })],
);

/**
 * コンテキスト素材とラベルの関連
 */
export const context_asset_projects = sqliteTable(
  "context_asset_projects",
  {
    context_asset_id: integer("context_asset_id")
      .notNull()
      .references(() => context_assets.id),
    project_id: integer("project_id")
      .notNull()
      .references(() => projects.id),
    created_at: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.context_asset_id, table.project_id] })],
);

/**
 * テストケースとコンテキスト素材の関連
 */
export const test_case_context_assets = sqliteTable(
  "test_case_context_assets",
  {
    test_case_id: integer("test_case_id")
      .notNull()
      .references(() => test_cases.id),
    context_asset_id: integer("context_asset_id")
      .notNull()
      .references(() => context_assets.id),
    created_at: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.test_case_id, table.context_asset_id] })],
);

/**
 * プロンプト系列とコンテキスト素材の関連
 */
export const prompt_family_context_assets = sqliteTable(
  "prompt_family_context_assets",
  {
    prompt_family_id: integer("prompt_family_id")
      .notNull()
      .references(() => prompt_families.id),
    context_asset_id: integer("context_asset_id")
      .notNull()
      .references(() => context_assets.id),
    created_at: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.prompt_family_id, table.context_asset_id] })],
);

export type TestCaseProject = typeof test_case_projects.$inferSelect;
export type NewTestCaseProject = typeof test_case_projects.$inferInsert;
export type PromptVersionProject = typeof prompt_version_projects.$inferSelect;
export type NewPromptVersionProject = typeof prompt_version_projects.$inferInsert;
export type ContextAssetProject = typeof context_asset_projects.$inferSelect;
export type NewContextAssetProject = typeof context_asset_projects.$inferInsert;
export type TestCaseContextAsset = typeof test_case_context_assets.$inferSelect;
export type NewTestCaseContextAsset = typeof test_case_context_assets.$inferInsert;
export type PromptFamilyContextAsset = typeof prompt_family_context_assets.$inferSelect;
export type NewPromptFamilyContextAsset = typeof prompt_family_context_assets.$inferInsert;
