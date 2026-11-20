/**
 * DBスキーマの検査コマンド（`pnpm check:db:dev` / `pnpm check:db:local`）。
 *
 * 判定はサーバー起動時の assertRequiredSchema と同じ inspectSchema を使う（#215）。
 * 検査対象：第1引数 → DB_PATH → DEFAULT_DEV_DB_PATH（ルートの dev.db）の順（相対パスは作業ディレクトリ基準、file: URL も可）。
 * DBは読み取り専用で開き、変更しない。問題があれば exit 1。
 */
import { existsSync } from "node:fs";
import { getSchemaIssues } from "./schema-check";
import { DEFAULT_DEV_DB_PATH, resolveSqliteFilePath } from "./sqlite-path";

function main(): number {
  const configuredPath = process.argv[2] ?? process.env.DB_PATH ?? DEFAULT_DEV_DB_PATH;
  const dbFilePath = resolveSqliteFilePath(configuredPath, process.cwd());

  console.log(`DB schema check target: ${dbFilePath}`);

  // 読み取り専用で開くので空のファイルは作られないが、分かりやすいエラーにするため先に確認する
  if (!existsSync(dbFilePath)) {
    console.error(`DB ファイルが見つかりません: ${dbFilePath}`);
    return 1;
  }

  const { missing, obsolete } = getSchemaIssues(dbFilePath);
  if (missing.length === 0 && obsolete.length === 0) {
    console.log("Schema OK");
    return 0;
  }

  console.error("Schema mismatch detected:");
  for (const column of missing) {
    console.error(`- 不足している列: ${column}`);
  }
  for (const column of obsolete) {
    console.error(`- 旧スキーマから残っている列: ${column}`);
  }
  console.error(
    "対象のDBに `pnpm --filter @prompt-reviewer/core migrate`（DB_PATH を指定）を実行してください。",
  );
  return 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
