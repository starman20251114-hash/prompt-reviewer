import type Database from "better-sqlite3";

/**
 * サーバーの起動に必要な列。足りなければ起動時に検知する。
 */
const requiredColumns = {
  prompt_versions: ["workflow_definition"],
  // run_mode / prompt_snapshot / ad_hoc_input は 0019（runs の作り直し）で追加される
  runs: ["execution_trace", "structured_output", "run_mode", "prompt_snapshot", "ad_hoc_input"],
  // 0016。#211 で既存DBから飛ばされることがある
  execution_profiles: ["max_tokens"],
  project_settings: ["max_tokens"],
  annotation_tasks: ["name", "description", "output_mode"],
  annotation_labels: ["annotation_task_id", "key", "name", "color", "display_order"],
  annotation_candidates: [
    "run_id",
    "annotation_task_id",
    "target_text_ref",
    "source_type",
    "source_step_id",
    "label",
    "start_line",
    "end_line",
    "quote",
    "rationale",
    "status",
    "note",
  ],
  gold_annotations: [
    "annotation_task_id",
    "target_text_ref",
    "label",
    "start_line",
    "end_line",
    "quote",
    "note",
    "source_candidate_id",
  ],
} as const;

/**
 * 旧スキーマに残っていてはいけない列。
 * test_cases.project_id は 0013 で削除される（NOT NULL のまま残るとテストケースを登録できない。#211）。
 */
const obsoleteColumns = {
  test_cases: ["project_id"],
} as const;

export type SchemaIssues = {
  /** 不足している列（`table.column`） */
  missing: string[];
  /** 旧スキーマから残っている列（`table.column`） */
  obsolete: string[];
};

function getColumns(sqlite: Database.Database, tableName: string): string[] {
  return sqlite
    .prepare(`PRAGMA table_info(\`${tableName}\`)`)
    .all()
    .map((column) => String((column as { name?: unknown }).name ?? ""));
}

/**
 * DBのスキーマを確認し、不足している列と旧スキーマから残っている列を返す。
 */
export function inspectSchema(sqlite: Database.Database): SchemaIssues {
  const missing: string[] = [];
  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    const actual = getColumns(sqlite, tableName);
    for (const column of columns) {
      if (!actual.includes(column)) missing.push(`${tableName}.${column}`);
    }
  }

  const obsolete: string[] = [];
  for (const [tableName, columns] of Object.entries(obsoleteColumns)) {
    const actual = getColumns(sqlite, tableName);
    for (const column of columns) {
      if (actual.includes(column)) obsolete.push(`${tableName}.${column}`);
    }
  }

  return { missing, obsolete };
}
