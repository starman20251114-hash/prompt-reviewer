import path from "node:path";
import Database from "better-sqlite3";

const expectedSchema = {
  prompt_versions: ["workflow_definition"],
  runs: ["execution_trace", "structured_output"],
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

function getColumns(db: Database.Database, tableName: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => String((column as { name?: unknown }).name ?? ""));
}

export function getMissingSchemaColumns(dbPath: string): string[] {
  const resolvedPath = path.resolve(process.cwd(), dbPath);
  const sqlite = new Database(resolvedPath, { readonly: true });

  try {
    const issues: string[] = [];

    for (const [tableName, expectedColumns] of Object.entries(expectedSchema)) {
      const actualColumns = getColumns(sqlite, tableName);
      const missingColumns = expectedColumns.filter((column) => !actualColumns.includes(column));

      if (missingColumns.length > 0) {
        issues.push(`${tableName}.${missingColumns.join(", ")}`);
      }
    }

    return issues;
  } finally {
    sqlite.close();
  }
}

export function assertRequiredSchema(dbPath: string): void {
  const missingColumns = getMissingSchemaColumns(dbPath);

  if (missingColumns.length === 0) {
    return;
  }

  const migrateCommand =
    dbPath.includes("data/") || dbPath.includes("data\\")
      ? "pnpm migrate:local"
      : "pnpm migrate:dev";

  throw new Error(
    `DB schema is outdated: missing ${missingColumns.join(", ")}. Run \`${migrateCommand}\` before starting the server.`,
  );
}
