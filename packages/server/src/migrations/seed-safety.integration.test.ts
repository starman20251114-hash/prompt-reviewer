/**
 * #217: seed の誤実行で開発データを失わないための安全策
 *
 * - 対象DBの選び方（DB_PATH。未指定ならルートの dev.db）と、既存データを消してよいかの許可は別のもの
 * - 既存データがあるDBへの seed は、`--reset` を明示しない限り拒否し、DBを一切変更しない
 * - `--reset` を指定したときだけ、1つのトランザクションでデータを消してから投入する
 *
 * 一時ディレクトリに「ルート/packages/core」の構成を作り、seed を子プロセスとして実行する。
 * 実際のリポジトリのDBには触れない。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMigrations } from "../test-utils/create-test-db.js";

const coreDir = fileURLToPath(new URL("../../../core/", import.meta.url));
const seedPath = path.join(coreDir, "src/seed.ts");
const tsxCli = createRequire(path.join(coreDir, "package.json")).resolve("tsx/cli");

let workRoot: string;
let workPackageDir: string;
/** 一時ディレクトリ内のルートの dev.db に当たるファイル（DB_PATH 未指定時の対象） */
let rootDb: string;

beforeEach(() => {
  workRoot = mkdtempSync(path.join(tmpdir(), "seed-safety-"));
  workPackageDir = path.join(workRoot, "packages", "core");
  mkdirSync(workPackageDir, { recursive: true });
  rootDb = path.join(workRoot, "dev.db");
});

afterEach(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

function createMigratedDb(file: string): string {
  const sqlite = new Database(file);
  try {
    for (const { sql } of loadMigrations()) sqlite.exec(sql);
  } finally {
    sqlite.close();
  }
  return file;
}

/** 開発中のDBを模して、seed では作らないテーブル（アノテーション・退避テーブル）にもデータを入れる */
function addDevelopmentData(file: string): void {
  const sqlite = new Database(file);
  try {
    const now = 1_700_000_000_000;
    sqlite
      .prepare(
        "INSERT INTO projects (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run("開発中のプロジェクト", null, now, now);
    const task = sqlite
      .prepare("INSERT INTO annotation_tasks (name, created_at, updated_at) VALUES (?, ?, ?)")
      .run("概要抽出", now, now);
    sqlite
      .prepare(
        "INSERT INTO annotation_labels (annotation_task_id, key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(task.lastInsertRowid, "summary", "概要", now, now);
    sqlite
      .prepare("INSERT INTO __project_settings_duplicates_0020 (id, project_id) VALUES (?, ?)")
      .run(99, 1);
  } finally {
    sqlite.close();
  }
}

/** 全テーブルの内容（行の順序によらない） */
function snapshot(file: string): Record<string, string[]> {
  const sqlite = new Database(file, { readonly: true });
  try {
    const tables = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    return Object.fromEntries(
      tables.map((table) => [
        table,
        (sqlite.prepare(`SELECT * FROM \`${table}\``).all() as unknown[])
          .map((row) => JSON.stringify(row))
          .sort(),
      ]),
    );
  } finally {
    sqlite.close();
  }
}

function count(file: string, table: string): number {
  const sqlite = new Database(file, { readonly: true });
  try {
    return (sqlite.prepare(`SELECT COUNT(*) AS c FROM \`${table}\``).get() as { c: number }).c;
  } finally {
    sqlite.close();
  }
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** ジャーナルなどの付随ファイルが残っていないこと */
const sideFiles = (file: string) =>
  readdirSync(path.dirname(file)).filter(
    (name) => name.startsWith(path.basename(file)) && name !== path.basename(file),
  );

function runSeed(args: string[] = [], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [tsxCli, seedPath, ...args], {
    cwd: workPackageDir,
    encoding: "utf8",
    env: { ...process.env, DB_PATH: undefined, ...env },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("既存データがあるDBへの seed（--reset なし）", () => {
  it("DB_PATH 未指定（ルートの dev.db）なら拒否し、ファイルを1バイトも変更しない", () => {
    createMigratedDb(rootDb);
    addDevelopmentData(rootDb);
    const before = sha256(rootDb);

    const { status, output } = runSeed();

    expect(status).toBe(1);
    expect(output).toContain("既存のデータがあるため");
    expect(output).toContain("projects: 1件");
    expect(output).toContain("annotation_tasks: 1件");
    expect(output).toContain("--reset");
    expect(sha256(rootDb)).toBe(before);
    expect(sideFiles(rootDb)).toEqual([]);
  });

  it("DB_PATH を明示しても、それだけでは削除を許可しない", () => {
    const other = createMigratedDb(path.join(workRoot, "other.sqlite"));
    addDevelopmentData(other);
    const before = sha256(other);

    const { status, output } = runSeed([], { DB_PATH: other });

    expect(status).toBe(1);
    expect(output).toContain("既存のデータがあるため");
    expect(sha256(other)).toBe(before);
  });

  it("前回の seed のデータだけが入っているDBも拒否する", () => {
    createMigratedDb(rootDb);
    expect(runSeed().status).toBe(0);
    const before = sha256(rootDb);

    const { status } = runSeed();

    expect(status).toBe(1);
    expect(sha256(rootDb)).toBe(before);
  });
});

describe("空のDBへの seed", () => {
  it("--reset なしで投入できる（マイグレーションの記録や退避テーブルは既存データとみなさない）", () => {
    createMigratedDb(rootDb);

    const { status, output } = runSeed();

    expect(output).not.toMatch(/Error|失敗/);
    expect(status).toBe(0);
    expect(count(rootDb, "projects")).toBe(1);
    expect(count(rootDb, "scores")).toBe(2);
  });
});

describe("--reset を指定した seed", () => {
  it("seed が作らないテーブルも含めて既存データを消してから投入する。マイグレーションの記録と退避テーブルは残す", () => {
    createMigratedDb(rootDb);
    addDevelopmentData(rootDb);
    const migrationsBefore = snapshot(rootDb).__drizzle_migrations;

    const { status, output } = runSeed(["--reset"]);

    expect(output).not.toMatch(/Error|失敗/);
    expect(status).toBe(0);
    const after = snapshot(rootDb);
    expect(after.projects).toHaveLength(1);
    expect(after.projects?.[0]).not.toContain("開発中のプロジェクト");
    expect(after.annotation_tasks).toEqual([]);
    expect(after.annotation_labels).toEqual([]);
    expect(after.__drizzle_migrations).toEqual(migrationsBefore);
    expect(after.__project_settings_duplicates_0020).toHaveLength(1);

    const sqlite = new Database(rootDb, { readonly: true });
    try {
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("投入の途中で失敗したら全体を元に戻し、既存データを失わない", () => {
    createMigratedDb(rootDb);
    addDevelopmentData(rootDb);
    const sqlite = new Database(rootDb);
    sqlite.exec(
      "CREATE TRIGGER fail_on_score BEFORE INSERT ON scores BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
    );
    sqlite.close();
    const before = snapshot(rootDb);

    const { status, output } = runSeed(["--reset"]);

    expect(status).toBe(1);
    expect(output).toContain("injected failure");
    expect(snapshot(rootDb)).toEqual(before);
    expect(sideFiles(rootDb)).toEqual([]);
  });
});

describe("そのほかの安全策", () => {
  it("対象のDBファイルがなければ作らずに失敗する", () => {
    const { status, output } = runSeed();

    expect(status).toBe(1);
    expect(output).toContain("DB ファイルが見つかりません");
    expect(existsSync(rootDb)).toBe(false);
    expect(existsSync(path.join(workPackageDir, "dev.db"))).toBe(false);
  });

  it("知らないオプションは拒否し、DBを変更しない（--force などの打ち間違いで削除しない）", () => {
    createMigratedDb(rootDb);
    addDevelopmentData(rootDb);
    const before = sha256(rootDb);

    const { status, output } = runSeed(["--force"]);

    expect(status).toBe(2);
    expect(output).toContain("--force");
    expect(sha256(rootDb)).toBe(before);
  });
});
