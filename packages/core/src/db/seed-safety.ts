import type Database from "better-sqlite3";

/**
 * seed の誤実行で開発データを失わないための判定（#217）。
 *
 * 対象DBの選び方（DB_PATH。未指定ならルートの dev.db）と、既存データを削除してよいかの許可は別のもの。
 * 削除の許可は `--reset` を明示したときだけ与え、DB_PATH の指定・未指定では変わらない。
 */

type SqliteDatabase = Database.Database;

/** 既存データの削除を許可するオプション */
export const SEED_RESET_OPTION = "--reset";

export class SeedUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedUsageError";
  }
}

export type SeedOptions = {
  /** 既存データを削除してから投入する */
  reset: boolean;
};

/**
 * seed のコマンドライン引数を解釈する。
 * 打ち間違い（`--force` など）で削除してしまわないよう、知らない引数はエラーにする。
 */
export function parseSeedArgs(args: readonly string[]): SeedOptions {
  let reset = false;
  for (const arg of args) {
    if (arg === SEED_RESET_OPTION) {
      reset = true;
    } else if (arg !== "--") {
      throw new SeedUsageError(
        `不明な引数です: ${arg}。既存データを削除して投入する場合は ${SEED_RESET_OPTION} を指定してください。`,
      );
    }
  }
  return { reset };
}

/**
 * アプリのデータを持つテーブル。
 * SQLite の内部テーブル、マイグレーションの記録（__drizzle_migrations）、
 * マイグレーションの退避用テーブル（__ で始まるもの）は含めない。これらは seed で削除しない。
 */
export function listDataTables(sqlite: SqliteDatabase): string[] {
  return (
    sqlite
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_\\_%' ESCAPE '\\'
         ORDER BY name`,
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
}

export type ExistingData = { table: string; count: number };

/** 行があるデータテーブルと、その件数 */
export function findExistingData(sqlite: SqliteDatabase): ExistingData[] {
  return listDataTables(sqlite)
    .map((table) => ({
      table,
      count: (sqlite.prepare(`SELECT COUNT(*) AS c FROM \`${table}\``).get() as { c: number }).c,
    }))
    .filter(({ count }) => count > 0);
}

/**
 * データテーブルの行をすべて削除する。トランザクションの中で呼ぶこと。
 * 外部キーの確認をコミット時まで遅らせるため、テーブルの順序によらず削除できる。
 */
export function clearDataTables(sqlite: SqliteDatabase): void {
  if (!sqlite.inTransaction) {
    throw new Error("clearDataTables はトランザクションの中で呼んでください");
  }
  sqlite.pragma("defer_foreign_keys = ON");
  for (const table of listDataTables(sqlite)) {
    sqlite.exec(`DELETE FROM \`${table}\``);
  }
}

/** 既存データがあるため seed を中止したときのメッセージ */
export function formatExistingDataRefusal(dbFilePath: string, existing: ExistingData[]): string {
  return [
    "既存のデータがあるため、seed を中止しました（DBは変更していません）。",
    `対象: ${dbFilePath}`,
    ...existing.map(({ table, count }) => `  ${table}: ${count}件`),
    "",
    `既存のデータをすべて削除してサンプルデータを投入する場合は、${SEED_RESET_OPTION} を指定してください:`,
    `  pnpm --filter @prompt-reviewer/core seed ${SEED_RESET_OPTION}`,
    "別のDBに投入する場合は、DB_PATH でそのDBを指定してください。",
  ].join("\n");
}
