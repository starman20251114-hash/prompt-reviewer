/**
 * マイグレーション 0020（UNIQUE インデックスの補修）の統合テスト（in-memory SQLite）
 *
 * drizzle-kit migrate で作成したDBには、0011・0012 の UNIQUE インデックスが存在しない（#209）。
 * そのDBを再現し、0020 が重複データを失わずにインデックスを作成すること、
 * 失敗した場合は全体がロールバックされることを検証する。
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMigrations } from "../test-utils/create-test-db.js";

const BREAKPOINT = "--> statement-breakpoint";
const UNIQUE_INDEXES = ["execution_profiles_name_unique", "project_settings_project_id_unique"];
const NOW = 1_000_000;

type SqliteDb = InstanceType<typeof Database>;

function findMigration0020(): string {
  const migration = loadMigrations().find(({ tag }) => tag.startsWith("0020_"));
  if (!migration) throw new Error("マイグレーション 0020 が見つかりません");
  return migration.sql;
}

/**
 * drizzle-kit migrate で 0019 まで適用したDBを再現する。
 * drizzle-kit（libsql）は 0011・0012 の2文目を実行しないため、UNIQUE インデックスがない。
 */
function createDbAppliedUntil0019(): SqliteDb {
  const sqlite = new Database(":memory:");
  for (const { tag, sql } of loadMigrations()) {
    if (tag >= "0020") break;
    sqlite.exec(sql);
  }
  for (const name of UNIQUE_INDEXES) {
    sqlite.exec(`DROP INDEX IF EXISTS \`${name}\``);
  }
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

/**
 * drizzle-kit と同じく、区切りごとに分けた文を1つのトランザクションで適用する。
 */
function applyMigration0020(sqlite: SqliteDb): void {
  const statements = findMigration0020()
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  sqlite.transaction(() => {
    for (const statement of statements) {
      sqlite.exec(statement);
    }
  })();
}

function insertProfile(sqlite: SqliteDb, name: string, model = "claude-sonnet-4-5"): number {
  return Number(
    sqlite
      .prepare(
        "INSERT INTO execution_profiles (name, model, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(name, model, NOW, NOW).lastInsertRowid,
  );
}

function insertProject(sqlite: SqliteDb, name: string): number {
  return Number(
    sqlite
      .prepare("INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)")
      .run(name, NOW, NOW).lastInsertRowid,
  );
}

function insertProjectSettings(sqlite: SqliteDb, projectId: number, model: string): number {
  return Number(
    sqlite
      .prepare(
        "INSERT INTO project_settings (project_id, model, temperature, created_at, updated_at) VALUES (?, ?, 0.3, ?, ?)",
      )
      .run(projectId, model, NOW, NOW).lastInsertRowid,
  );
}

function insertRun(sqlite: SqliteDb, executionProfileId: number): number {
  const familyId = Number(
    sqlite
      .prepare("INSERT INTO prompt_families (name, created_at, updated_at) VALUES ('f', ?, ?)")
      .run(NOW, NOW).lastInsertRowid,
  );
  const versionId = Number(
    sqlite
      .prepare(
        "INSERT INTO prompt_versions (prompt_family_id, version, content, created_at) VALUES (?, 1, 'v', ?)",
      )
      .run(familyId, NOW).lastInsertRowid,
  );
  return Number(
    sqlite
      .prepare(
        `INSERT INTO runs (prompt_version_id, execution_profile_id, prompt_snapshot, conversation,
           created_at, model, temperature, api_provider)
         VALUES (?, ?, 's', '[]', ?, 'm', 0.7, 'anthropic')`,
      )
      .run(versionId, executionProfileId, NOW).lastInsertRowid,
  );
}

function listUniqueIndexes(sqlite: SqliteDb): string[] {
  return (
    sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (${UNIQUE_INDEXES.map(() => "?").join(",")}) ORDER BY name`,
      )
      .all(...UNIQUE_INDEXES) as { name: string }[]
  ).map((row) => row.name);
}

function listProfiles(sqlite: SqliteDb) {
  return sqlite.prepare("SELECT id, name, model FROM execution_profiles ORDER BY id").all();
}

function listSettings(sqlite: SqliteDb) {
  return sqlite
    .prepare("SELECT id, project_id, model, temperature FROM project_settings ORDER BY id")
    .all();
}

function listBackup(sqlite: SqliteDb) {
  return sqlite
    .prepare(
      "SELECT id, project_id, model, temperature FROM __project_settings_duplicates_0020 ORDER BY id",
    )
    .all();
}

function tableExists(sqlite: SqliteDb, name: string): boolean {
  return (
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  );
}

describe("マイグレーション 0020: UNIQUE インデックスの補修", () => {
  let sqlite: SqliteDb;

  beforeEach(() => {
    sqlite = createDbAppliedUntil0019();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("前提: drizzle-kit で作成したDBを再現すると UNIQUE インデックスがない", () => {
    expect(listUniqueIndexes(sqlite)).toEqual([]);
  });

  it("重複がなければデータを変えずに UNIQUE インデックスだけを作成する", () => {
    const projectId = insertProject(sqlite, "P1");
    insertProfile(sqlite, "A");
    insertProfile(sqlite, "B");
    insertProjectSettings(sqlite, projectId, "only");
    const profilesBefore = listProfiles(sqlite);
    const settingsBefore = listSettings(sqlite);

    applyMigration0020(sqlite);

    expect(listUniqueIndexes(sqlite)).toEqual(UNIQUE_INDEXES);
    expect(listProfiles(sqlite)).toEqual(profilesBefore);
    expect(listSettings(sqlite)).toEqual(settingsBefore);
    expect(listBackup(sqlite)).toEqual([]);
  });

  it("空のDBにも適用できる", () => {
    applyMigration0020(sqlite);

    expect(listUniqueIndexes(sqlite)).toEqual(UNIQUE_INDEXES);
  });

  it("重複した実行プロファイルは削除せず、id 最小以外を改名する", () => {
    const first = insertProfile(sqlite, "A", "m-first");
    const second = insertProfile(sqlite, "A", "m-second");
    const third = insertProfile(sqlite, "A", "m-third");
    const other = insertProfile(sqlite, "B", "m-other");

    applyMigration0020(sqlite);

    expect(listProfiles(sqlite)).toEqual([
      { id: first, name: "A", model: "m-first" },
      { id: second, name: `A (重複 #${second})`, model: "m-second" },
      { id: third, name: `A (重複 #${third})`, model: "m-third" },
      { id: other, name: "B", model: "m-other" },
    ]);
  });

  it("重複した実行プロファイルを参照する Run の参照先は変わらない", () => {
    const first = insertProfile(sqlite, "A");
    const second = insertProfile(sqlite, "A");
    const runForFirst = insertRun(sqlite, first);
    const runForSecond = insertRun(sqlite, second);

    applyMigration0020(sqlite);

    const runs = sqlite.prepare("SELECT id, execution_profile_id FROM runs ORDER BY id").all();
    expect(runs).toEqual([
      { id: runForFirst, execution_profile_id: first },
      { id: runForSecond, execution_profile_id: second },
    ]);
    const orphanCount = sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM runs r
         LEFT JOIN execution_profiles e ON e.id = r.execution_profile_id
         WHERE r.execution_profile_id IS NOT NULL AND e.id IS NULL`,
      )
      .get() as { n: number };
    expect(orphanCount.n).toBe(0);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("重複したプロジェクト設定は id 最小の行を残し、それ以外を退避テーブルに移す", () => {
    const projectA = insertProject(sqlite, "PA");
    const projectB = insertProject(sqlite, "PB");
    const keptA = insertProjectSettings(sqlite, projectA, "a-first");
    const movedA1 = insertProjectSettings(sqlite, projectA, "a-second");
    const keptB = insertProjectSettings(sqlite, projectB, "b-only");
    const movedA2 = insertProjectSettings(sqlite, projectA, "a-third");

    applyMigration0020(sqlite);

    expect(listSettings(sqlite)).toEqual([
      { id: keptA, project_id: projectA, model: "a-first", temperature: 0.3 },
      { id: keptB, project_id: projectB, model: "b-only", temperature: 0.3 },
    ]);
    expect(listBackup(sqlite)).toEqual([
      { id: movedA1, project_id: projectA, model: "a-second", temperature: 0.3 },
      { id: movedA2, project_id: projectA, model: "a-third", temperature: 0.3 },
    ]);
  });

  it("改名先の名前がすでに使われている場合は全体をロールバックする", () => {
    const projectId = insertProject(sqlite, "P1");
    insertProfile(sqlite, "A");
    const second = insertProfile(sqlite, "A");
    insertProfile(sqlite, `A (重複 #${second})`);
    insertProjectSettings(sqlite, projectId, "first");
    insertProjectSettings(sqlite, projectId, "second");
    const profilesBefore = listProfiles(sqlite);
    const settingsBefore = listSettings(sqlite);

    expect(() => applyMigration0020(sqlite)).toThrow(/UNIQUE constraint failed/);

    expect(listProfiles(sqlite)).toEqual(profilesBefore);
    expect(listSettings(sqlite)).toEqual(settingsBefore);
    expect(listUniqueIndexes(sqlite)).toEqual([]);
    expect(tableExists(sqlite, "__project_settings_duplicates_0020")).toBe(false);
  });

  it("UNIQUE インデックスがすでにあるDB（exec で適用したDB）にも適用でき、何も変えない", () => {
    const fullDb = new Database(":memory:");
    try {
      for (const { tag, sql } of loadMigrations()) {
        if (tag >= "0020") break;
        fullDb.exec(sql);
      }
      expect(listUniqueIndexes(fullDb)).toEqual(UNIQUE_INDEXES);
      insertProfile(fullDb, "A");

      applyMigration0020(fullDb);

      expect(listUniqueIndexes(fullDb)).toEqual(UNIQUE_INDEXES);
      expect(listProfiles(fullDb)).toEqual([{ id: 1, name: "A", model: "claude-sonnet-4-5" }]);
    } finally {
      fullDb.close();
    }
  });

  it("適用後は同じ名前の実行プロファイルと、同じプロジェクトの設定を追加できない", () => {
    applyMigration0020(sqlite);
    const projectId = insertProject(sqlite, "P1");
    insertProfile(sqlite, "A");
    insertProjectSettings(sqlite, projectId, "first");

    expect(() => insertProfile(sqlite, "A")).toThrow(
      /UNIQUE constraint failed: execution_profiles\.name/,
    );
    expect(() => insertProjectSettings(sqlite, projectId, "second")).toThrow(
      /UNIQUE constraint failed: project_settings\.project_id/,
    );
  });
});
