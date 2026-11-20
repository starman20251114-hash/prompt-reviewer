/**
 * #217: DB_PATH を指定しないときの開発用DBの参照先を統一する
 *
 * 開発用コマンド（pnpm dev・migrate:dev・check:db:dev・seed）は、DB_PATH を指定しないとき
 * どれもモノレポ直下の dev.db を使う。以前は seed.ts だけ既定値が ./dev.db で、
 * packages/core/dev.db に投入されていた。
 *
 * 一時ディレクトリに「ルート/packages/core」の構成を作り、各コマンドを子プロセスとして実行する。
 * 実際のリポジトリの dev.db には触れない。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DEV_DB_PATH, resolveSqliteFilePath } from "@prompt-reviewer/core";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMigrations } from "../test-utils/create-test-db.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const coreDir = path.join(repoRoot, "packages/core");
const serverDir = path.join(repoRoot, "packages/server");
const tsxCli = createRequire(path.join(coreDir, "package.json")).resolve("tsx/cli");

let workRoot: string;
/** 一時ディレクトリ内の packages/core に当たる作業ディレクトリ */
let workPackageDir: string;
/** 一時ディレクトリ内のルートの dev.db に当たるファイル */
let workRootDb: string;

beforeEach(() => {
  workRoot = mkdtempSync(path.join(tmpdir(), "default-db-path-"));
  workPackageDir = path.join(workRoot, "packages", "core");
  mkdirSync(workPackageDir, { recursive: true });
  workRootDb = path.join(workRoot, "dev.db");
});

afterEach(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

/** 全マイグレーションを適用したDBを作る */
function createMigratedDb(file: string): string {
  const sqlite = new Database(file);
  try {
    for (const { sql } of loadMigrations()) sqlite.exec(sql);
  } finally {
    sqlite.close();
  }
  return file;
}

function countRows(file: string, table: string): number {
  const sqlite = new Database(file, { readonly: true });
  try {
    return (sqlite.prepare(`SELECT COUNT(*) AS c FROM \`${table}\``).get() as { c: number }).c;
  } finally {
    sqlite.close();
  }
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** core のスクリプトを、一時ディレクトリの packages/core を作業ディレクトリとして実行する */
function runCoreScript(
  relativeScript: string,
  args: string[] = [],
  env: Record<string, string> = {},
) {
  const result = spawnSync(
    process.execPath,
    [tsxCli, path.join(coreDir, relativeScript), ...args],
    {
      cwd: workPackageDir,
      encoding: "utf8",
      env: { ...process.env, DB_PATH: undefined, ...env },
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("DEFAULT_DEV_DB_PATH", () => {
  it("packages/core と packages/server のどちらから解決しても、ルートの dev.db を指す", () => {
    const expected = path.join(repoRoot, "dev.db");

    expect(resolveSqliteFilePath(DEFAULT_DEV_DB_PATH, coreDir)).toBe(expected);
    expect(resolveSqliteFilePath(DEFAULT_DEV_DB_PATH, serverDir)).toBe(expected);
  });
});

describe("seed（DB_PATH 未指定）", () => {
  it("ルートの dev.db に投入し、作業ディレクトリ（packages/core）に dev.db を作らない", () => {
    createMigratedDb(workRootDb);

    const { status, output } = runCoreScript("src/seed.ts");

    expect(output).not.toMatch(/Error|エラー/);
    expect(status).toBe(0);
    expect(countRows(workRootDb, "projects")).toBeGreaterThan(0);
    expect(countRows(workRootDb, "test_cases")).toBeGreaterThan(0);
    expect(existsSync(path.join(workPackageDir, "dev.db"))).toBe(false);
  });

  it("DB_PATH を指定したときはそのDBに投入し、ルートの dev.db は変更しない", () => {
    createMigratedDb(workRootDb);
    const before = sha256(workRootDb);
    const other = createMigratedDb(path.join(workRoot, "other.sqlite"));

    const { status } = runCoreScript("src/seed.ts", [], { DB_PATH: other });

    expect(status).toBe(0);
    expect(countRows(other, "projects")).toBeGreaterThan(0);
    expect(sha256(workRootDb)).toBe(before);
  });
});

describe("DB を扱う CLI（DB_PATH 未指定）", () => {
  it("検査コマンドはルートの dev.db を対象にする", () => {
    createMigratedDb(workRootDb);

    const { status, output } = runCoreScript("src/db/check-db-schema-cli.ts");

    expect(output).toContain(`DB schema check target: ${workRootDb}`);
    expect(status).toBe(0);
  });

  it("修復コマンドはルートの dev.db を対象にし、存在しなければ作らずに失敗する", () => {
    const { status, output } = runCoreScript("src/db/repair-skipped-migrations-cli.ts");

    expect(output).toContain(workRootDb);
    expect(status).toBe(1);
    expect(existsSync(workRootDb)).toBe(false);
    expect(existsSync(path.join(workPackageDir, "dev.db"))).toBe(false);
  });
});

/** テストを除く TypeScript のソース（再帰） */
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name) ? [full] : [];
  });
}

describe("既定値の書き方（再発防止）", () => {
  const sources = [
    ...listSourceFiles(path.join(coreDir, "src")),
    ...listSourceFiles(path.join(serverDir, "src")),
    path.join(coreDir, "drizzle.config.ts"),
  ];
  const definition = path.join(coreDir, "src/db/sqlite-path.ts");
  const relative = (file: string) => path.relative(repoRoot, file).replaceAll("\\", "/");

  it("DB_PATH の既定値は、すべて DEFAULT_DEV_DB_PATH を使う", () => {
    const readers = sources.filter((file) =>
      readFileSync(file, "utf8").includes("process.env.DB_PATH"),
    );
    const violations = readers.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.includes("process.env.DB_PATH ??"))
        .filter((line) => !/process\.env\.DB_PATH \?\? DEFAULT_DEV_DB_PATH\b/.test(line))
        .map((line) => `${relative(file)}: ${line.trim()}`),
    );

    // 検査対象が空にならないよう、DB_PATH を読む主な箇所が含まれることを確かめる
    expect(readers.map(relative)).toEqual(
      expect.arrayContaining([
        "packages/core/src/seed.ts",
        "packages/core/src/db/client.ts",
        "packages/core/src/db/check-db-schema-cli.ts",
        "packages/core/src/db/repair-skipped-migrations-cli.ts",
        "packages/core/drizzle.config.ts",
        "packages/server/src/index.ts",
      ]),
    );
    expect(violations).toEqual([]);
  });

  it("dev.db のパスを文字列で書くのは DEFAULT_DEV_DB_PATH の定義だけ", () => {
    const literals = sources
      .filter((file) => file !== definition)
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .filter((line) => /["'`][^"'`\n]*dev\.db["'`]/.test(line))
          .map((line) => `${relative(file)}: ${line.trim()}`),
      );

    expect(literals).toEqual([]);
  });

  it("ルートの migrate:dev・check:db:dev（packages/core で実行）は、ルートの dev.db を対象にする", () => {
    const { scripts } = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const expected = path.join(repoRoot, "dev.db");

    for (const name of ["migrate:dev", "check:db:dev"]) {
      const script = scripts[name] ?? "";
      expect(script, name).toContain("--filter @prompt-reviewer/core");
      const configured = script.match(/([^\s'"]*dev\.db)/)?.[1];
      expect(configured, name).toBeDefined();
      expect(resolveSqliteFilePath(configured ?? "", coreDir), name).toBe(expected);
    }
  });
});
