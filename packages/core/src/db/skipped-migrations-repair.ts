import type Database from "better-sqlite3";

/**
 * #211: journal の when が単調増加していないため、既存DBで drizzle-kit migrate が
 * 0013・0016（と 0018）をエラーなしに飛ばす。
 * 適用済みの journal・マイグレーションは書き換えず、実際のスキーマを見て足りない部分だけを補う。
 *
 * - 0016: execution_profiles / project_settings に max_tokens を追加する
 * - 0013: test_cases.project_id を test_case_projects に移し、test_cases を作り直して列を削除する
 * - 0018: 0019 で runs が作り直されるため、修復は不要
 *
 * 正常なDB（新規DB・修復済みのDB）では何も変更しない。
 * 修復は1つのトランザクションで行い、失敗した場合は全体をロールバックする。
 */

type SqliteDatabase = Database.Database;

export class SkippedMigrationsRepairError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SkippedMigrationsRepairError";
  }
}

export type SkippedMigrationsRepairResult = {
  /** 実行した修復の説明。何もしなかった場合は空 */
  actions: string[];
};

/** 0013 適用後の test_cases の列（0013 の __new_test_cases と同じ順序） */
const TEST_CASE_COLUMNS = [
  "id",
  "title",
  "turns",
  "context_content",
  "expected_description",
  "display_order",
  "created_at",
  "updated_at",
] as const;

/** 修復の前提となるテーブル（0012 までに作成される） */
const REQUIRED_TABLES = [
  "execution_profiles",
  "project_settings",
  "test_cases",
  "test_case_projects",
] as const;

function getColumns(sqlite: SqliteDatabase, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(\`${table}\`)`).all() as { name: string }[]).map(
    (column) => column.name,
  );
}

function tableExists(sqlite: SqliteDatabase, table: string): boolean {
  return (
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
    undefined
  );
}

type ForeignKeyViolation = { table: string; rowid: number | null; parent: string; fkid: number };

function foreignKeyViolationKeys(sqlite: SqliteDatabase): Set<string> {
  const rows = sqlite.prepare("PRAGMA foreign_key_check").all() as ForeignKeyViolation[];
  return new Set(rows.map((row) => `${row.table}#${row.rowid}->${row.parent}(${row.fkid})`));
}

/** 修復を始める前に、想定外の状態でないかを確かめる（何も変更しない） */
function assertRepairable(sqlite: SqliteDatabase): void {
  const missingTables = REQUIRED_TABLES.filter((table) => !tableExists(sqlite, table));
  if (missingTables.length > 0) {
    throw new SkippedMigrationsRepairError(
      `修復に必要なテーブルがありません: ${missingTables.join(", ")}。先に drizzle-kit migrate を完了させてください。`,
    );
  }

  const testCaseColumns = getColumns(sqlite, "test_cases");
  if (!testCaseColumns.includes("project_id")) return;

  const expected: readonly string[] = [...TEST_CASE_COLUMNS, "project_id"];
  const unexpected = testCaseColumns.filter((column) => !expected.includes(column));
  const missing = expected.filter((column) => !testCaseColumns.includes(column));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new SkippedMigrationsRepairError(
      `test_cases の列が想定と異なるため、データを失わないよう修復を中止しました（想定外: ${unexpected.join(", ") || "なし"} / 不足: ${missing.join(", ") || "なし"}）。`,
    );
  }
}

/** 0013 と同じ手順で test_cases を作り直す。移した紐付けの件数を返す */
function rebuildTestCasesWithoutProjectId(sqlite: SqliteDatabase): number {
  const sequence = sqlite
    .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'test_cases'")
    .get() as { seq: number } | undefined;
  const columnList = TEST_CASE_COLUMNS.map((column) => `\`${column}\``).join(", ");

  sqlite.exec(`
    CREATE TABLE \`__new_test_cases\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`title\` text NOT NULL,
      \`turns\` text NOT NULL,
      \`context_content\` text DEFAULT '' NOT NULL,
      \`expected_description\` text,
      \`display_order\` integer DEFAULT 0 NOT NULL,
      \`created_at\` integer NOT NULL,
      \`updated_at\` integer NOT NULL
    );
    INSERT INTO \`__new_test_cases\`(${columnList}) SELECT ${columnList} FROM \`test_cases\`;
  `);
  const linked = sqlite
    .prepare(
      `INSERT OR IGNORE INTO \`test_case_projects\`(\`test_case_id\`, \`project_id\`, \`created_at\`)
       SELECT \`id\`, \`project_id\`, \`created_at\` FROM \`test_cases\` WHERE \`project_id\` IS NOT NULL`,
    )
    .run().changes;
  sqlite.exec(`
    DROP TABLE \`test_cases\`;
    ALTER TABLE \`__new_test_cases\` RENAME TO \`test_cases\`;
  `);

  // 削除済みのテストケースの id を再利用しないよう、AUTOINCREMENT の採番を引き継ぐ
  if (sequence) {
    const updated = sqlite
      .prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'test_cases'")
      .run(sequence.seq).changes;
    if (updated === 0) {
      sqlite
        .prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('test_cases', ?)")
        .run(sequence.seq);
    }
  }
  return linked;
}

/**
 * #211 で飛ばされたマイグレーションの内容のうち、DBに欠けている部分だけを修復する。
 * drizzle-kit migrate の後に実行する。
 */
export function repairSkippedMigrations(sqlite: SqliteDatabase): SkippedMigrationsRepairResult {
  assertRepairable(sqlite);

  const actions: string[] = [];
  const needsMaxTokens = ["execution_profiles", "project_settings"].filter(
    (table) => !getColumns(sqlite, table).includes("max_tokens"),
  );
  const needsTestCaseRebuild = getColumns(sqlite, "test_cases").includes("project_id");
  if (needsMaxTokens.length === 0 && !needsTestCaseRebuild) {
    return { actions };
  }

  // テーブルを作り直すため外部キーの検査を止める。PRAGMA foreign_keys はトランザクション内では効かない
  const foreignKeysBefore = sqlite.pragma("foreign_keys", { simple: true });
  sqlite.pragma("foreign_keys = OFF");
  try {
    sqlite.transaction(() => {
      const violationsBefore = foreignKeyViolationKeys(sqlite);

      for (const table of needsMaxTokens) {
        sqlite.exec(`ALTER TABLE \`${table}\` ADD \`max_tokens\` integer`);
        actions.push(`0016: ${table}.max_tokens を追加`);
      }
      if (needsTestCaseRebuild) {
        const linked = rebuildTestCasesWithoutProjectId(sqlite);
        actions.push(
          `0013: test_cases.project_id を test_case_projects に移して列を削除（${linked}件）`,
        );
      }

      // 修復によって新しく生じた外部キー違反があれば、全体をロールバックする
      const introduced = [...foreignKeyViolationKeys(sqlite)].filter(
        (key) => !violationsBefore.has(key),
      );
      if (introduced.length > 0) {
        throw new SkippedMigrationsRepairError(
          `修復後の foreign_key_check で違反が見つかったため、ロールバックしました: ${introduced.slice(0, 5).join(", ")}${introduced.length > 5 ? ` ほか${introduced.length - 5}件` : ""}`,
        );
      }
    })();
  } catch (error) {
    actions.length = 0;
    if (error instanceof SkippedMigrationsRepairError) throw error;
    throw new SkippedMigrationsRepairError(
      `修復に失敗したため、ロールバックしました: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    sqlite.pragma(`foreign_keys = ${foreignKeysBefore ? "ON" : "OFF"}`);
  }

  return { actions };
}
