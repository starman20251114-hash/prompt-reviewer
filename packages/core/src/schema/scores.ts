import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { runs } from "./runs";

/**
 * スコアテーブル
 * 実行結果に対する人間評価とLLM Judgeの評価を管理する
 *
 * human_score: 人間が付けた 1〜5 点のスコア（未評価時は null）
 * human_comment: 人間によるフリーテキストコメント（任意）
 * judge_score: LLM Judge が付けた 1〜5 点のスコア（フェーズ2実装、フェーズ1は null）
 * judge_reason: LLM Judge の評価理由（フェーズ2実装、フェーズ1は null）
 * is_discarded: 廃棄フラグ（不正データや再実行後に無効化したスコアに使用）
 */
export const scores = sqliteTable("scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  run_id: integer("run_id")
    .notNull()
    .references(() => runs.id),
  human_score: integer("human_score"),
  human_comment: text("human_comment"),
  judge_score: integer("judge_score"),
  judge_reason: text("judge_reason"),
  is_discarded: integer("is_discarded").notNull().default(0),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

// Drizzle推論型のエクスポート
export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;
