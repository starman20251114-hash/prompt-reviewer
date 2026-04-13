/**
 * Score スキーマの型定義テスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * ここではDBへの実際の接続なしにスキーマの型安全性のみを検証する。
 * マイグレーションの動作検証は `pnpm run migrate` で別途確認済み。
 */
import { describe, expectTypeOf, it } from "vitest";
import type { NewScore, Score } from "./scores.js";

describe("scores スキーマ型定義", () => {
  describe("Score 型", () => {
    it("Score 型は必須フィールドを持つ", () => {
      type RequiredFields = {
        id: number;
        run_id: number;
        is_discarded: boolean;
        created_at: number;
        updated_at: number;
      };
      expectTypeOf<
        Pick<Score, "id" | "run_id" | "is_discarded" | "created_at" | "updated_at">
      >().toMatchTypeOf<RequiredFields>();
    });

    it("Score の human_score はオプショナル（null許容・未評価時は null）", () => {
      expectTypeOf<Score["human_score"]>().toEqualTypeOf<number | null>();
    });

    it("Score の human_comment はオプショナル（null許容）", () => {
      expectTypeOf<Score["human_comment"]>().toEqualTypeOf<string | null>();
    });

    it("Score の judge_score はオプショナル（null許容・フェーズ2実装予定）", () => {
      expectTypeOf<Score["judge_score"]>().toEqualTypeOf<number | null>();
    });

    it("Score の judge_reason はオプショナル（null許容・フェーズ2実装予定）", () => {
      expectTypeOf<Score["judge_reason"]>().toEqualTypeOf<string | null>();
    });

    it("Score の is_discarded は boolean 型", () => {
      expectTypeOf<Score["is_discarded"]>().toEqualTypeOf<boolean>();
    });

    it("Score の run_id は number 型", () => {
      expectTypeOf<Score["run_id"]>().toEqualTypeOf<number>();
    });

    it("Score の created_at は number 型（Unixタイムスタンプ）", () => {
      expectTypeOf<Score["created_at"]>().toEqualTypeOf<number>();
    });

    it("Score の updated_at は number 型（Unixタイムスタンプ）", () => {
      expectTypeOf<Score["updated_at"]>().toEqualTypeOf<number>();
    });
  });

  describe("NewScore 型", () => {
    it("NewScore は id なしで作成できる（AutoIncrement）", () => {
      const now = Date.now();
      const newScore: NewScore = {
        run_id: 1,
        created_at: now,
        updated_at: now,
      };
      expectTypeOf(newScore).toMatchTypeOf<NewScore>();
    });

    it("NewScore の is_discarded はデフォルト値があるためオプショナル", () => {
      expectTypeOf<NewScore["is_discarded"]>().toEqualTypeOf<boolean | undefined>();
    });

    it("NewScore の human_score はオプショナル（null許容）", () => {
      expectTypeOf<NewScore["human_score"]>().toEqualTypeOf<number | null | undefined>();
    });

    it("NewScore の human_comment はオプショナル（null許容）", () => {
      expectTypeOf<NewScore["human_comment"]>().toEqualTypeOf<string | null | undefined>();
    });

    it("NewScore の judge_score はオプショナル（null許容）", () => {
      expectTypeOf<NewScore["judge_score"]>().toEqualTypeOf<number | null | undefined>();
    });

    it("NewScore の judge_reason はオプショナル（null許容）", () => {
      expectTypeOf<NewScore["judge_reason"]>().toEqualTypeOf<string | null | undefined>();
    });

    it("人間スコアのみを持つ NewScore を作成できる（フェーズ1）", () => {
      const now = Date.now();
      const humanOnlyScore: NewScore = {
        run_id: 1,
        human_score: 4,
        human_comment: "良い回答だが、もう少し具体的にできる",
        created_at: now,
        updated_at: now,
      };
      expectTypeOf(humanOnlyScore).toMatchTypeOf<NewScore>();
    });

    it("LLM Judge スコアも持つ NewScore を作成できる（フェーズ2）", () => {
      const now = Date.now();
      const judgedScore: NewScore = {
        run_id: 2,
        human_score: 5,
        human_comment: "非常に良い回答",
        judge_score: 5,
        judge_reason: "共感表現が適切で、具体的な解決策を提示できている",
        created_at: now,
        updated_at: now,
      };
      expectTypeOf(judgedScore).toMatchTypeOf<NewScore>();
    });

    it("廃棄フラグを立てた NewScore を作成できる", () => {
      const now = Date.now();
      const discardedScore: NewScore = {
        run_id: 3,
        human_score: 2,
        is_discarded: true,
        created_at: now,
        updated_at: now,
      };
      expectTypeOf(discardedScore).toMatchTypeOf<NewScore>();
    });
  });
});
