import Database from "better-sqlite3";
import path from "node:path";

const configuredPath = process.argv[2] ?? process.env.DB_PATH ?? "../../dev.db";
const resolvedPath = path.resolve(process.cwd(), configuredPath);

const expectedSchema = {
  projects: ["id", "name", "description", "created_at", "updated_at"],
  project_settings: [
    "id",
    "project_id",
    "model",
    "temperature",
    "api_provider",
    "created_at",
    "updated_at",
  ],
  test_cases: [
    "id",
    "project_id",
    "title",
    "turns",
    "context_content",
    "expected_description",
    "display_order",
    "created_at",
    "updated_at",
  ],
  prompt_versions: [
    "id",
    "project_id",
    "version",
    "name",
    "memo",
    "content",
    "workflow_definition",
    "parent_version_id",
    "created_at",
    "is_selected",
  ],
  runs: [
    "id",
    "project_id",
    "prompt_version_id",
    "test_case_id",
    "conversation",
    "execution_trace",
    "is_best",
    "is_discarded",
    "created_at",
    "model",
    "temperature",
    "api_provider",
  ],
  scores: [
    "id",
    "run_id",
    "human_score",
    "human_comment",
    "judge_score",
    "judge_reason",
    "is_discarded",
    "created_at",
    "updated_at",
  ],
};

function getColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function formatList(values) {
  return values.map((value) => `\`${value}\``).join(", ");
}

const db = new Database(resolvedPath, { readonly: true });
const issues = [];

for (const [tableName, expectedColumns] of Object.entries(expectedSchema)) {
  const actualColumns = getColumns(db, tableName);

  if (actualColumns.length === 0) {
    issues.push(`table \`${tableName}\` が存在しません`);
    continue;
  }

  const missingColumns = expectedColumns.filter((column) => !actualColumns.includes(column));
  if (missingColumns.length > 0) {
    issues.push(
      `table \`${tableName}\` に不足カラムがあります: ${formatList(missingColumns)}\n` +
        `  actual: ${formatList(actualColumns)}`,
    );
  }
}

console.log(`DB schema check target: ${resolvedPath}`);

if (issues.length > 0) {
  console.error("Schema mismatch detected:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Schema OK");
