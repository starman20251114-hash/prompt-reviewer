/**
 * #215: DB検査コマンド（pnpm check:db:*）の統合テスト
 *
 * 一時ディレクトリに SQLite ファイルを作り、検査コマンドを子プロセスとして実際に実行する。
 * 正しいスキーマのDBを正常、古いスキーマのDBを異常と判定すること（以前は逆に判定していた）を確かめる。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspectSchema, repairSkippedMigrations } from "@prompt-reviewer/core";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMigrations } from "../test-utils/create-test-db.js";

const coreDir = fileURLToPath(new URL("../../../core/", import.meta.url));
const cliPath = path.join(coreDir, "src/db/check-db-schema-cli.ts");
const tsxCli = createRequire(path.join(coreDir, "package.json")).resolve("tsx/cli");

/** #211 で既存DBから飛ばされるマイグレーション */
const SKIPPED_211 = ["0013_", "0016_", "0018_"];

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "check-db-schema-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** 一時ファイルにDBを作り、`include` が true のマイグレーションだけを journal の順に適用する */
function createDbFile(name: string, include: (tag: string) => boolean = () => true): string {
  const file = path.join(workDir, name);
  const sqlite = new Database(file);
  try {
    for (const { tag, sql } of loadMigrations()) {
      if (include(tag)) sqlite.exec(sql);
    }
  } finally {
    sqlite.close();
  }
  return file;
}

/** 新規DB：全マイグレーションを適用したもの */
const createFreshDb = () => createDbFile("fresh.sqlite");

/** #211 の既存DB：0013・0016・0018 が飛ばされたもの */
const createSkipped211Db = () =>
  createDbFile("skipped-211.sqlite", (tag) => !SKIPPED_211.some((p) => tag.startsWith(p)));

/** 0019 を適用していない古いDB（0018 まで） */
const createBefore0019Db = () => createDbFile("before-0019.sqlite", (tag) => tag < "0019");

function runCheck(args: string[], env: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [tsxCli, cliPath, ...args], {
    cwd: coreDir,
    encoding: "utf8",
    env: { ...process.env, DB_PATH: undefined, ...env },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

describe("検査コマンド（check-db-schema-cli）", () => {
  it("全マイグレーションを適用した新規DBを正常と判定する（exit 0）", () => {
    const { status, output } = runCheck([createFreshDb()]);

    expect(output).toContain("Schema OK");
    expect(output).not.toContain("Schema mismatch");
    expect(status).toBe(0);
  });

  it("#211 で 0013・0016 が欠けたDBを異常と判定し、不足列と残存列を表示する（exit 1）", () => {
    const { status, output } = runCheck([createSkipped211Db()]);

    expect(status).toBe(1);
    expect(output).toContain("Schema mismatch");
    expect(output).toContain("execution_profiles.max_tokens");
    expect(output).toContain("project_settings.max_tokens");
    expect(output).toContain("test_cases.project_id");
    expect(output).not.toContain("Schema OK");
  });

  it("0019 を適用していないDBを、runs の新しい列の不足として異常と判定する（exit 1）", () => {
    const { status, output } = runCheck([createBefore0019Db()]);

    expect(status).toBe(1);
    expect(output).toContain("runs.run_mode");
    expect(output).toContain("runs.prompt_snapshot");
    expect(output).toContain("runs.ad_hoc_input");
  });

  it("#211 の修復を行ったDBを正常と判定する（exit 0）", () => {
    const file = createSkipped211Db();
    const sqlite = new Database(file);
    try {
      repairSkippedMigrations(sqlite);
    } finally {
      sqlite.close();
    }

    const { status, output } = runCheck([file]);

    expect(output).toContain("Schema OK");
    expect(status).toBe(0);
  });

  it("引数がなければ DB_PATH 環境変数のDBを検査する", () => {
    expect(runCheck([], { DB_PATH: createSkipped211Db() }).status).toBe(1);
    expect(runCheck([], { DB_PATH: createFreshDb() }).status).toBe(0);
  });

  it("file: URL で指定したDBも検査できる", () => {
    const { status, output } = runCheck([pathToFileURL(createFreshDb()).href]);

    expect(output).toContain("Schema OK");
    expect(status).toBe(0);
  });

  it("検査対象のパスを表示する", () => {
    const file = createFreshDb();

    expect(runCheck([file]).output).toContain(file);
  });

  it("存在しないパスはエラーにし、空のDBファイルを作らない（exit 1）", () => {
    const missing = path.join(workDir, "missing.sqlite");

    const { status, output } = runCheck([missing]);

    expect(status).toBe(1);
    expect(output).toContain("見つかりません");
    expect(existsSync(missing)).toBe(false);
  });

  it("検査でDBファイルを変更しない", () => {
    const file = createSkipped211Db();
    const before = sha256(file);

    runCheck([file]);

    expect(sha256(file)).toBe(before);
  });
});

describe("inspectSchema（起動時の検査と検査コマンドが共有する判定）", () => {
  it("0019 を適用していないDBでは runs の新しい列の不足を報告する", () => {
    const sqlite = new Database(createBefore0019Db());
    try {
      expect(inspectSchema(sqlite).missing).toEqual([
        "runs.run_mode",
        "runs.prompt_snapshot",
        "runs.ad_hoc_input",
      ]);
    } finally {
      sqlite.close();
    }
  });
});
