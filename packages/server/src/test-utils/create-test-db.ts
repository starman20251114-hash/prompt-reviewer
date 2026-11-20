import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "@prompt-reviewer/core";
import type { DB } from "@prompt-reviewer/core";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const migrationsDir = fileURLToPath(new URL("../../../core/drizzle/", import.meta.url));

type Journal = { entries: { idx: number; tag: string }[] };

/**
 * journal に記録されたマイグレーションSQLを適用順に読み込む。
 * journal と .sql ファイルが食い違っている場合は、適用漏れを防ぐため例外にする。
 */
function loadMigrationSqls(): string[] {
  const journal = JSON.parse(readFileSync(`${migrationsDir}meta/_journal.json`, "utf8")) as Journal;
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

  const journalFiles = entries.map((entry) => `${entry.tag}.sql`);
  const sqlFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const notInJournal = sqlFiles.filter((name) => !journalFiles.includes(name));
  const missingFiles = journalFiles.filter((name) => !sqlFiles.includes(name));
  if (notInJournal.length > 0 || missingFiles.length > 0) {
    throw new Error(
      `マイグレーションの journal と SQL ファイルが一致しません: journal外=${notInJournal.join(",")} ファイルなし=${missingFiles.join(",")}`,
    );
  }

  return journalFiles.map((name) => readFileSync(`${migrationsDir}${name}`, "utf8"));
}

/**
 * 統合テスト用の in-memory SQLite DB を作成する。
 *
 * drizzle-orm の migrate() は、statement-breakpoint で区切られていない複数文を含む
 * マイグレーション（0011・0012）を適用できないため、journal の順に better-sqlite3 の
 * exec() で適用する。exec() は複数文を実行でき、SQL が失敗すると例外を投げる。
 *
 * 注意: drizzle-kit migrate で作成したDBには 0011・0012 の UNIQUE インデックスが
 * 作成されない問題がある（#209）。このヘルパーで作成したDBには作成される。
 */
export function createTestDb(): { db: DB; close: () => void } {
  const sqlite = new Database(":memory:");
  try {
    for (const sql of loadMigrationSqls()) {
      sqlite.exec(sql);
    }
    sqlite.pragma("foreign_keys = ON");
  } catch (error) {
    sqlite.close();
    throw error;
  }

  const db = drizzle(sqlite, { schema }) as unknown as DB;
  return { db, close: () => sqlite.close() };
}
