/**
 * テスト用スタブ: @prompt-reviewer/core のスキーマ型定義のみをエクスポート
 * DB接続（better-sqlite3）を含む client.ts はエクスポートしない。
 * vitest.config.ts のエイリアスでこのファイルを指定することで、
 * ネイティブバイナリのビルドエラーを回避する。
 */
export * from "../schema/index.js";
export * from "../llm/index.js";

// DB型のみエクスポート（実際のDBインスタンスは含まない）
export type { DB } from "../db/client.js";
