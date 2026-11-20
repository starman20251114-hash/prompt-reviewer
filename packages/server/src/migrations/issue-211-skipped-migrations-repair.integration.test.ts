import path from "node:path";
import { pathToFileURL } from "node:url";
/**
 * #211: journal の when の逆転で飛ばされたマイグレーション（0013・0016）の修復の統合テスト（in-memory SQLite）
 *
 * drizzle-kit migrate は「DBに記録された created_at の最大値より when が新しいもの」だけを適用するため、
 * 既存DBでは 0013・0016・0018 が飛ばされる。0018 は 0019 で上書きされるので影響がないが、
 * 0013（test_cases.project_id の削除と test_case_projects への移行）と
 * 0016（max_tokens の追加）が欠けたままになる。
 */
import {
  SkippedMigrationsRepairError,
  inspectSchema,
  repairSkippedMigrations,
  resolveSqliteFilePath,
} from "@prompt-reviewer/core";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { loadMigrations } from "../test-utils/create-test-db.js";

type SqliteDb = InstanceType<typeof Database>;

/** #211 で既存DBから飛ばされるマイグレーション */
const SKIPPED_TAG_PREFIXES = ["0013_", "0016_", "0018_"];

const opened: SqliteDb[] = [];

function open(): SqliteDb {
  const sqlite = new Database(":memory:");
  opened.push(sqlite);
  return sqlite;
}

afterEach(() => {
  for (const sqlite of opened.splice(0)) sqlite.close();
});

/** 新規DB：全マイグレーションを適用したもの */
function createFreshDb(): SqliteDb {
  const sqlite = open();
  for (const { sql } of loadMigrations()) sqlite.exec(sql);
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

/**
 * 既存DB：0012 まで適用した状態で `setup` でデータを入れ、
 * その後 drizzle-kit migrate と同じく 0013・0016・0018 を飛ばして最後まで適用したもの
 */
function createSkippedDb(setup?: (sqlite: SqliteDb) => void): SqliteDb {
  const sqlite = open();
  const migrations = loadMigrations();
  for (const { tag, sql } of migrations) {
    if (tag >= "0013") break;
    sqlite.exec(sql);
  }
  setup?.(sqlite);
  for (const { tag, sql } of migrations) {
    if (tag < "0013" || SKIPPED_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix))) continue;
    sqlite.exec(sql);
  }
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

/**
 * 0020 の退避テーブル。`CREATE TABLE AS SELECT * FROM project_settings` で作られるため、
 * max_tokens が欠けたDBでは退避テーブルにも max_tokens がない。アプリからは使われない退避用の
 * テーブルなので修復の対象外とし、スキーマの比較からも除く。
 */
const BACKUP_TABLE_0020 = "__project_settings_duplicates_0020";

/** 列・型・NOT NULL・既定値・主キー・FK・インデックスを比較用の文字列にする */
function schemaShape(sqlite: SqliteDb): string[] {
  const objects = (
    sqlite
      .prepare(
        `SELECT type, name FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY type, name`,
      )
      .all() as { type: string; name: string }[]
  ).filter(({ name }) => name !== BACKUP_TABLE_0020);
  const shape: string[] = [];
  for (const { type, name } of objects) {
    if (type === "index") {
      shape.push(`index ${name}`);
      continue;
    }
    if (type !== "table") continue;
    for (const c of sqlite.prepare(`PRAGMA table_info(\`${name}\`)`).all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: unknown;
      pk: number;
    }[]) {
      shape.push(
        `col ${name}.${c.name} ${c.type} notnull=${c.notnull} dflt=${c.dflt_value} pk=${c.pk}`,
      );
    }
    for (const f of sqlite.prepare(`PRAGMA foreign_key_list(\`${name}\`)`).all() as {
      from: string;
      table: string;
      to: string;
    }[]) {
      shape.push(`fk ${name}.${f.from} -> ${f.table}.${f.to}`);
    }
  }
  return shape.sort();
}

/** 全テーブルの全行（DBが変わっていないことの確認用） */
function dumpAll(sqlite: SqliteDb): Record<string, unknown[]> {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, sqlite.prepare(`SELECT * FROM \`${name}\``).all()]),
  );
}

function columns(sqlite: SqliteDb, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(\`${table}\`)`).all() as { name: string }[]).map(
    (c) => c.name,
  );
}

function insertProject(sqlite: SqliteDb, name: string): number {
  return Number(
    sqlite
      .prepare("INSERT INTO projects (name, created_at, updated_at) VALUES (?, 100, 100)")
      .run(name).lastInsertRowid,
  );
}

/** 0012 時点の test_cases（project_id あり）に1行追加する */
function insertLegacyTestCase(
  sqlite: SqliteDb,
  values: { projectId: number; title: string; createdAt: number; expected?: string | null },
): number {
  return Number(
    sqlite
      .prepare(
        `INSERT INTO test_cases (project_id, title, turns, context_content, expected_description, display_order, created_at, updated_at)
         VALUES (?, ?, '[{"role":"user","content":"hi"}]', 'ctx', ?, 3, ?, ?)`,
      )
      .run(
        values.projectId,
        values.title,
        values.expected ?? null,
        values.createdAt,
        values.createdAt + 1,
      ).lastInsertRowid,
  );
}

/** 既存DBの典型的なデータ：プロジェクト2件、テストケース3件、実行プロファイル・設定・Run・コンテキスト資産 */
function seedLegacyData(sqlite: SqliteDb) {
  const p1 = insertProject(sqlite, "P1");
  const p2 = insertProject(sqlite, "P2");
  const tc1 = insertLegacyTestCase(sqlite, {
    projectId: p1,
    title: "A",
    createdAt: 1000,
    expected: "期待A",
  });
  const tc2 = insertLegacyTestCase(sqlite, { projectId: p1, title: "B", createdAt: 2000 });
  const tc3 = insertLegacyTestCase(sqlite, { projectId: p2, title: "C", createdAt: 3000 });
  // 削除済みのテストケース（AUTOINCREMENT の採番が巻き戻らないことの確認用）
  const deleted = insertLegacyTestCase(sqlite, {
    projectId: p2,
    title: "削除済み",
    createdAt: 4000,
  });
  sqlite.prepare("DELETE FROM test_cases WHERE id = ?").run(deleted);

  sqlite
    .prepare(
      "INSERT INTO execution_profiles (name, model, temperature, created_at, updated_at) VALUES ('prof', 'claude-x', 0.2, 100, 100)",
    )
    .run();
  sqlite
    .prepare(
      "INSERT INTO project_settings (project_id, model, temperature, api_provider, created_at, updated_at) VALUES (?, 'claude-y', 0.4, 'anthropic', 100, 100)",
    )
    .run(p1);
  const assetId = Number(
    sqlite
      .prepare(
        "INSERT INTO context_assets (name, path, content, mime_type, content_hash, created_at, updated_at) VALUES ('a', 'a.md', 'x', 'text/markdown', 'h', 100, 100)",
      )
      .run().lastInsertRowid,
  );
  sqlite
    .prepare(
      "INSERT INTO test_case_context_assets (test_case_id, context_asset_id, created_at) VALUES (?, ?, 100)",
    )
    .run(tc2, assetId);
  const versionId = Number(
    sqlite
      .prepare(
        "INSERT INTO prompt_versions (project_id, version, content, created_at) VALUES (?, 1, 'v', 100)",
      )
      .run(p1).lastInsertRowid,
  );
  sqlite
    .prepare(
      `INSERT INTO runs (project_id, prompt_version_id, test_case_id, conversation, is_best, is_discarded, created_at, model, temperature, api_provider)
       VALUES (?, ?, ?, '[]', 0, 0, 100, 'm', 0.7, 'anthropic')`,
    )
    .run(p1, versionId, tc3);

  return { p1, p2, tc1, tc2, tc3, deleted };
}

describe("前提：#211 の既存DBの再現", () => {
  it("0013・0016 が飛ばされたDBは、新規DBと比べて max_tokens がなく test_cases.project_id が残る", () => {
    const fresh = schemaShape(createFreshDb());
    const skipped = schemaShape(createSkippedDb());

    expect(fresh.filter((line) => !skipped.includes(line))).toEqual([
      "col execution_profiles.max_tokens INTEGER notnull=0 dflt=null pk=0",
      "col project_settings.max_tokens INTEGER notnull=0 dflt=null pk=0",
    ]);
    expect(skipped.filter((line) => !fresh.includes(line))).toEqual([
      "col test_cases.project_id INTEGER notnull=1 dflt=null pk=0",
      "fk test_cases.project_id -> projects.id",
    ]);
  });
});

describe("repairSkippedMigrations", () => {
  it("飛ばされたDBを修復すると、スキーマが新規DBと完全に一致する", () => {
    const sqlite = createSkippedDb(seedLegacyData);

    const result = repairSkippedMigrations(sqlite);

    expect(result.actions).toEqual([
      "0016: execution_profiles.max_tokens を追加",
      "0016: project_settings.max_tokens を追加",
      "0013: test_cases.project_id を test_case_projects に移して列を削除（3件）",
    ]);
    expect(schemaShape(sqlite)).toEqual(schemaShape(createFreshDb()));
  });

  it("test_cases.project_id の紐付けを test_case_projects に移す（created_at はテストケースの値）", () => {
    let ids!: ReturnType<typeof seedLegacyData>;
    const sqlite = createSkippedDb((db) => {
      ids = seedLegacyData(db);
    });

    repairSkippedMigrations(sqlite);

    expect(
      sqlite
        .prepare(
          "SELECT test_case_id, project_id, created_at FROM test_case_projects ORDER BY test_case_id",
        )
        .all(),
    ).toEqual([
      { test_case_id: ids.tc1, project_id: ids.p1, created_at: 1000 },
      { test_case_id: ids.tc2, project_id: ids.p1, created_at: 2000 },
      { test_case_id: ids.tc3, project_id: ids.p2, created_at: 3000 },
    ]);
  });

  it("すでにある紐付けは上書きせず、そのまま残す", () => {
    let ids!: ReturnType<typeof seedLegacyData>;
    const sqlite = createSkippedDb((db) => {
      ids = seedLegacyData(db);
      // 同じ組み合わせ（created_at が違う）と、別プロジェクトへの紐付けを先に登録しておく
      db.prepare(
        "INSERT INTO test_case_projects (test_case_id, project_id, created_at) VALUES (?, ?, 9), (?, ?, 8)",
      ).run(ids.tc1, ids.p1, ids.tc1, ids.p2);
    });

    repairSkippedMigrations(sqlite);

    expect(
      sqlite
        .prepare(
          "SELECT test_case_id, project_id, created_at FROM test_case_projects WHERE test_case_id = ? ORDER BY project_id",
        )
        .all(ids.tc1),
    ).toEqual([
      { test_case_id: ids.tc1, project_id: ids.p1, created_at: 9 },
      { test_case_id: ids.tc1, project_id: ids.p2, created_at: 8 },
    ]);
  });

  it("テストケース・Run・コンテキスト資産・プロファイル・設定のデータを保持する", () => {
    let ids!: ReturnType<typeof seedLegacyData>;
    const sqlite = createSkippedDb((db) => {
      ids = seedLegacyData(db);
    });
    const before = dumpAll(sqlite);

    repairSkippedMigrations(sqlite);
    const after = dumpAll(sqlite);

    // test_cases は project_id 以外の全列が同じ
    const withoutProjectId = (rows: unknown[]) =>
      rows.map((row) => {
        const { project_id: _omit, ...rest } = row as Record<string, unknown>;
        return rest;
      });
    expect(after.test_cases).toEqual(withoutProjectId(before.test_cases ?? []));
    expect((after.test_cases ?? []).map((row) => (row as { id: number }).id)).toEqual([
      ids.tc1,
      ids.tc2,
      ids.tc3,
    ]);

    // max_tokens は NULL で追加され、他の列は変わらない
    const withMaxTokensNull = (rows: unknown[]) =>
      rows.map((row) => ({ ...(row as Record<string, unknown>), max_tokens: null }));
    expect(after.execution_profiles).toEqual(withMaxTokensNull(before.execution_profiles ?? []));
    expect(after.project_settings).toEqual(withMaxTokensNull(before.project_settings ?? []));

    // テストケースを参照するテーブルはそのまま
    for (const table of ["runs", "test_case_context_assets", "projects", "prompt_versions"]) {
      expect(after[table]).toEqual(before[table]);
    }
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("AUTOINCREMENT の採番を巻き戻さない（削除済みのテストケースの id を再利用しない）", () => {
    let ids!: ReturnType<typeof seedLegacyData>;
    const sqlite = createSkippedDb((db) => {
      ids = seedLegacyData(db);
    });

    repairSkippedMigrations(sqlite);
    const newId = Number(
      sqlite
        .prepare(
          "INSERT INTO test_cases (title, turns, created_at, updated_at) VALUES ('新規', '[]', 1, 1)",
        )
        .run().lastInsertRowid,
    );

    expect(newId).toBe(ids.deleted + 1);
  });

  it("修復後は project_id を指定せずにテストケースを登録でき、max_tokens を読み書きできる", () => {
    const sqlite = createSkippedDb(seedLegacyData);

    repairSkippedMigrations(sqlite);

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO test_cases (title, turns, created_at, updated_at) VALUES ('t', '[]', 1, 1)",
        )
        .run(),
    ).not.toThrow();
    sqlite.prepare("UPDATE execution_profiles SET max_tokens = 2048").run();
    expect(sqlite.prepare("SELECT max_tokens FROM execution_profiles").get()).toEqual({
      max_tokens: 2048,
    });
  });

  it("2回目は何も変更しない（冪等）", () => {
    const sqlite = createSkippedDb(seedLegacyData);
    repairSkippedMigrations(sqlite);
    const once = dumpAll(sqlite);
    const shapeOnce = schemaShape(sqlite);

    const second = repairSkippedMigrations(sqlite);

    expect(second.actions).toEqual([]);
    expect(dumpAll(sqlite)).toEqual(once);
    expect(schemaShape(sqlite)).toEqual(shapeOnce);
  });

  it("新規DBでは何も変更しない", () => {
    const sqlite = createFreshDb();
    const before = dumpAll(sqlite);

    expect(repairSkippedMigrations(sqlite).actions).toEqual([]);
    expect(dumpAll(sqlite)).toEqual(before);
  });

  it("max_tokens を手作業で追加済みのDBでは、足りない部分だけを修復する", () => {
    const sqlite = createSkippedDb(seedLegacyData);
    sqlite.exec("ALTER TABLE `execution_profiles` ADD `max_tokens` integer");
    sqlite.exec("UPDATE execution_profiles SET max_tokens = 512");

    const result = repairSkippedMigrations(sqlite);

    expect(result.actions).toEqual([
      "0016: project_settings.max_tokens を追加",
      "0013: test_cases.project_id を test_case_projects に移して列を削除（3件）",
    ]);
    expect(sqlite.prepare("SELECT max_tokens FROM execution_profiles").all()).toEqual([
      { max_tokens: 512 },
    ]);
    expect(schemaShape(sqlite)).toEqual(schemaShape(createFreshDb()));
  });

  it("成功後に foreign_keys を元の設定（ON）に戻す", () => {
    const sqlite = createSkippedDb(seedLegacyData);

    repairSkippedMigrations(sqlite);

    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  describe("失敗時のロールバック", () => {
    it("存在しないプロジェクトを参照するテストケースがあれば、何も変更せずに例外を投げる", () => {
      const sqlite = createSkippedDb((db) => {
        seedLegacyData(db);
        db.pragma("foreign_keys = OFF");
        insertLegacyTestCase(db, { projectId: 999, title: "孤児", createdAt: 5000 });
      });
      const before = dumpAll(sqlite);
      const shapeBefore = schemaShape(sqlite);

      expect(() => repairSkippedMigrations(sqlite)).toThrow(SkippedMigrationsRepairError);
      expect(() => repairSkippedMigrations(sqlite)).toThrow(/foreign_key_check/);

      // 0016 の ADD COLUMN も含めて全体が戻っている
      expect(schemaShape(sqlite)).toEqual(shapeBefore);
      expect(dumpAll(sqlite)).toEqual(before);
      expect(columns(sqlite, "execution_profiles")).not.toContain("max_tokens");
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    });

    it("test_cases に想定外の列があれば、データを失わないよう何も変更せずに例外を投げる", () => {
      const sqlite = createSkippedDb(seedLegacyData);
      sqlite.exec("ALTER TABLE `test_cases` ADD `unknown_note` text");
      sqlite.exec("UPDATE test_cases SET unknown_note = 'keep me'");
      const before = dumpAll(sqlite);

      expect(() => repairSkippedMigrations(sqlite)).toThrow(/unknown_note/);
      expect(dumpAll(sqlite)).toEqual(before);
      expect(columns(sqlite, "execution_profiles")).not.toContain("max_tokens");
    });

    it("0013 より前の古いDB（test_case_projects がない）では、何も変更せずに migrate を先に促す", () => {
      const sqlite = open();
      for (const { tag, sql } of loadMigrations()) {
        if (tag >= "0009") break;
        sqlite.exec(sql);
      }
      const before = dumpAll(sqlite);

      expect(() => repairSkippedMigrations(sqlite)).toThrow(/test_case_projects/);
      expect(dumpAll(sqlite)).toEqual(before);
    });
  });
});

describe("inspectSchema", () => {
  it("新規DBでは問題を報告しない", () => {
    expect(inspectSchema(createFreshDb())).toEqual({ missing: [], obsolete: [] });
  });

  it("飛ばされたDBでは max_tokens の不足と test_cases.project_id の残存を報告する", () => {
    expect(inspectSchema(createSkippedDb())).toEqual({
      missing: ["execution_profiles.max_tokens", "project_settings.max_tokens"],
      obsolete: ["test_cases.project_id"],
    });
  });

  it("修復後は問題を報告しない", () => {
    const sqlite = createSkippedDb(seedLegacyData);
    repairSkippedMigrations(sqlite);

    expect(inspectSchema(sqlite)).toEqual({ missing: [], obsolete: [] });
  });

  it("従来から確認している列（runs.structured_output など）の不足も引き続き報告する", () => {
    const sqlite = open();
    for (const { tag, sql } of loadMigrations()) {
      if (tag >= "0014") break;
      sqlite.exec(sql);
    }

    expect(inspectSchema(sqlite).missing).toContain("runs.structured_output");
  });
});

describe("resolveSqliteFilePath", () => {
  it("相対パスは作業ディレクトリからの絶対パスにする", () => {
    expect(resolveSqliteFilePath("../../dev.db", "/repo/packages/core")).toBe(
      path.resolve("/repo/packages/core", "../../dev.db"),
    );
  });

  it("file: URL はファイルパスに変換する", () => {
    const absolute = path.resolve("/tmp/x.sqlite");
    expect(resolveSqliteFilePath(pathToFileURL(absolute).href, "/ignored")).toBe(absolute);
  });

  it("リモートの libsql / http の URL は修復できないので例外にする", () => {
    expect(() => resolveSqliteFilePath("libsql://example.turso.io", "/repo")).toThrow(
      /ローカルの SQLite ファイル/,
    );
    expect(() => resolveSqliteFilePath("https://example.com/db", "/repo")).toThrow(
      /ローカルの SQLite ファイル/,
    );
  });
});
