/**
 * マイグレーションファイルの再発防止テスト（DB接続なし）
 *
 * - drizzle-kit migrate は @libsql/client で実行され、statement-breakpoint の区切り1つにつき
 *   最初の1文しか実行しない。2文目以降はエラーにならずに捨てられる（#209）。
 * - drizzle の migrator は、最後に適用した created_at より journal の when が新しいものしか
 *   適用しない。when が逆転していると既存DBで黙って飛ばされる（#211）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(new URL("../../drizzle/", import.meta.url));
const BREAKPOINT = "--> statement-breakpoint";

type JournalEntry = { idx: number; when: number; tag: string; breakpoints: boolean };

function readJournal(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(`${migrationsDir}meta/_journal.json`, "utf8")) as {
    entries: JournalEntry[];
  };
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

/**
 * SQL文字列に含まれる文の数を数える。
 * 文字列リテラル・識別子の引用符・コメント内のセミコロンは区切りとして扱わない。
 */
function countSqlStatements(sql: string): number {
  let count = 0;
  let hasContent = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i] as string;
    const next = sql[i + 1];

    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === close) {
          // 引用符の二重化（'it''s'）はエスケープなので読み飛ばす
          if (close !== "]" && sql[j + 1] === close) {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      hasContent = true;
      i = j + 1;
      continue;
    }
    if (ch === ";") {
      if (hasContent) count += 1;
      hasContent = false;
      i += 1;
      continue;
    }
    if (!/\s/.test(ch)) hasContent = true;
    i += 1;
  }

  return hasContent ? count + 1 : count;
}

/**
 * 区切りなしで複数文を含む既存のマイグレーション。
 * 適用済みのファイルは書き換えず、0020 で UNIQUE インデックスを補修している（#209）。
 * ここに新しいファイルを追加してはいけない。
 */
const KNOWN_MULTI_STATEMENT_MIGRATIONS = ["0011_outstanding_the_call", "0012_sad_white_tiger"];

/**
 * when が直前までの最大値より古い既存のマイグレーション（#211）。
 * journal を直すと、手作業で列を追加済みのDBで再適用されて migrate が失敗するため、journal は変更しない。
 * 既存DBで飛ばされた 0013・0016 は、migrate の後に実行する修復（db/skipped-migrations-repair.ts）で補う。
 * ここに新しいエントリを追加してはいけない。
 */
const KNOWN_NON_MONOTONIC_WHEN = [
  "0004_project_settings",
  "0005_prompt_version_selected",
  "0013_test_cases_independent",
  "0016_max_tokens",
  "0018_runs_project_id_nullable",
];

describe("countSqlStatements", () => {
  it("末尾のセミコロンの有無にかかわらず1文として数える", () => {
    expect(countSqlStatements("CREATE TABLE a (id integer);")).toBe(1);
    expect(countSqlStatements("CREATE TABLE a (id integer)")).toBe(1);
  });

  it("空白・コメントだけなら0文", () => {
    expect(countSqlStatements("")).toBe(0);
    expect(countSqlStatements("  \n-- コメント;\n/* ブロック; */\n")).toBe(0);
  });

  it("区切りのない2文を2文として数える（0011 と同じ形）", () => {
    const sql =
      "DELETE FROM `t` WHERE `id` NOT IN (SELECT 1);\n\nCREATE UNIQUE INDEX `u` ON `t` (`name`);";
    expect(countSqlStatements(sql)).toBe(2);
  });

  it("文字列・識別子・コメント内のセミコロンは区切りにしない", () => {
    expect(countSqlStatements("INSERT INTO t VALUES ('a;b', 'it''s;');")).toBe(1);
    expect(countSqlStatements('UPDATE "a;b" SET `c;d` = [e;f];')).toBe(1);
    expect(countSqlStatements("SELECT 1; -- 後ろ; のコメント")).toBe(1);
  });

  it("文の後ろにコメントが続いても余計に数えない", () => {
    expect(countSqlStatements("PRAGMA foreign_keys=OFF;\n-- 次の区切りへ\n")).toBe(1);
  });
});

describe("マイグレーションSQLの statement-breakpoint", () => {
  const entries = readJournal();

  it("journal の全エントリに対応する .sql ファイルがある", () => {
    const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
    expect(files.sort()).toEqual(entries.map((entry) => `${entry.tag}.sql`).sort());
  });

  it("区切り1つにつき1文だけ含む（既知の例外 0011・0012 を除く）", () => {
    const violations = entries
      .map((entry) => {
        const sql = readFileSync(`${migrationsDir}${entry.tag}.sql`, "utf8");
        const counts = sql.split(BREAKPOINT).map(countSqlStatements);
        return { tag: entry.tag, counts };
      })
      .filter(({ counts }) => counts.some((count) => count > 1))
      .map(({ tag }) => tag);

    // 新しい違反の検出と、例外リストの取り残しの両方を検出するため完全一致で比較する
    expect(violations).toEqual(KNOWN_MULTI_STATEMENT_MIGRATIONS);
  });

  it("全エントリで breakpoints が有効になっている", () => {
    expect(entries.filter((entry) => !entry.breakpoints).map((entry) => entry.tag)).toEqual([]);
  });
});

describe("journal の when", () => {
  const entries = readJournal();

  it("各エントリの when が直前までの最大値より新しい（既知の例外 #211 を除く）", () => {
    const violations: string[] = [];
    let maxWhen = Number.NEGATIVE_INFINITY;
    for (const entry of entries) {
      if (entry.when <= maxWhen) violations.push(entry.tag);
      maxWhen = Math.max(maxWhen, entry.when);
    }

    expect(violations).toEqual(KNOWN_NON_MONOTONIC_WHEN);
  });

  it("最新のエントリの when は全エントリの中で最も新しい（既存DBで飛ばされない）", () => {
    const latest = entries[entries.length - 1];
    const others = entries.slice(0, -1);
    expect(latest).toBeDefined();
    expect(others.every((entry) => entry.when < (latest as JournalEntry).when)).toBe(true);
  });

  it("0020 は 0019 より後に適用される位置にある", () => {
    const repair = entries.find((entry) => entry.tag.startsWith("0020_"));
    const previous = entries.find((entry) => entry.tag.startsWith("0019_"));
    expect(repair).toBeDefined();
    expect(previous).toBeDefined();
    expect((repair as JournalEntry).when).toBeGreaterThan((previous as JournalEntry).when);
  });
});
