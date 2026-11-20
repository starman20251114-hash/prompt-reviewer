import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * DB_PATH（相対パス・絶対パス・file: URL）をローカルの SQLite ファイルの絶対パスにする。
 * drizzle.config.ts と同じく、相対パスは作業ディレクトリを基準にする。
 * リモートの URL（libsql: / http(s): / ws(s):）は直接開けないため例外にする。
 */
export function resolveSqliteFilePath(configuredPath: string, cwd: string): string {
  if (configuredPath.startsWith("file:")) {
    return fileURLToPath(configuredPath);
  }
  if (/^(libsql:|https?:|wss?:)/.test(configuredPath)) {
    throw new Error(
      `ローカルの SQLite ファイルではない DB_PATH は扱えません: ${configuredPath.replace(/\?.*$/, "")}`,
    );
  }
  return path.resolve(cwd, configuredPath);
}
