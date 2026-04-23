import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { execution_profiles } from "./execution-profiles";
import { projects } from "./projects";
import { prompt_versions } from "./prompt-versions";
import { test_cases } from "./test-cases";

/**
 * 実行結果テーブル
 * プロンプトバージョン×テストケースの実行結果を管理する（複数回保持）
 *
 * conversation: JSON文字列として保存するマルチターン会話 [{role, content}]
 * is_best: 同一バージョン×ケースの複数実行のうち、最良と判断した回答フラグ
 */
export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // 互換期間中は nullable で追加し、後続 Issue で必須化する。
  execution_profile_id: integer("execution_profile_id").references(() => execution_profiles.id),
  project_id: integer("project_id").references(() => projects.id),
  run_mode: text("run_mode").notNull().default("evaluation"),
  prompt_version_id: integer("prompt_version_id")
    .notNull()
    .references(() => prompt_versions.id),
  test_case_id: integer("test_case_id").references(() => test_cases.id),
  ad_hoc_input: text("ad_hoc_input"),
  prompt_snapshot: text("prompt_snapshot").notNull(),
  conversation: text("conversation").notNull(),
  execution_trace: text("execution_trace"),
  structured_output: text("structured_output"),
  is_best: integer("is_best", { mode: "boolean" }).notNull().default(false),
  is_discarded: integer("is_discarded", { mode: "boolean" }).notNull().default(false),
  created_at: integer("created_at").notNull(),
  // 実行時設定スナップショット（project_settings からコピー）
  model: text("model").notNull(),
  temperature: real("temperature").notNull(),
  api_provider: text("api_provider").notNull(),
});

// Drizzle推論型のエクスポート
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

/**
 * conversationカラムのJSONスキーマ型
 * text型で保存されるため、アプリケーション側でパース/シリアライズを行う
 */
export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ExecutionTraceStep = {
  id: string;
  title: string;
  prompt: string;
  renderedPrompt: string;
  inputConversation: ConversationMessage[];
  output: string;
};

export type StructuredOutputItem = {
  label: string;
  start_line: number;
  end_line: number;
  quote: string;
  rationale?: string;
};

export type StructuredOutput = {
  items: StructuredOutputItem[];
};

export type RunMode = "evaluation" | "quick";
