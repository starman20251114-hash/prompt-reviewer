/**
 * Run スキーマの型定義テスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * ここではDBへの実際の接続なしにスキーマの型安全性のみを検証する。
 * マイグレーションの動作検証は `pnpm run migrate` で別途確認済み。
 */
import { describe, expectTypeOf, it } from "vitest";
import type { ConversationMessage, NewRun, Run } from "./runs.js";

describe("runs スキーマ型定義", () => {
  describe("Run 型", () => {
    it("Run 型は必須フィールドを持つ", () => {
      type RequiredFields = {
        id: number;
        execution_profile_id: number | null;
        project_id: number;
        prompt_version_id: number;
        test_case_id: number;
        conversation: string;
        execution_trace: string | null;
        is_best: boolean;
        created_at: number;
        model: string;
        temperature: number;
        api_provider: string;
      };
      expectTypeOf<
        Pick<
          Run,
          | "id"
          | "execution_profile_id"
          | "project_id"
          | "prompt_version_id"
          | "test_case_id"
          | "conversation"
          | "execution_trace"
          | "is_best"
          | "created_at"
          | "model"
          | "temperature"
          | "api_provider"
        >
      >().toMatchTypeOf<RequiredFields>();
    });

    it("Run の execution_profile_id は移行期間中 number | null 型", () => {
      expectTypeOf<Run["execution_profile_id"]>().toEqualTypeOf<number | null>();
    });

    it("Run の conversation は string 型（JSONシリアライズ済み）", () => {
      expectTypeOf<Run["conversation"]>().toEqualTypeOf<string>();
    });

    it("Run の execution_trace は string | null 型", () => {
      expectTypeOf<Run["execution_trace"]>().toEqualTypeOf<string | null>();
    });

    it("Run の is_best は boolean 型", () => {
      expectTypeOf<Run["is_best"]>().toEqualTypeOf<boolean>();
    });

    it("Run の project_id は number 型", () => {
      expectTypeOf<Run["project_id"]>().toEqualTypeOf<number>();
    });

    it("Run の prompt_version_id は number 型", () => {
      expectTypeOf<Run["prompt_version_id"]>().toEqualTypeOf<number>();
    });

    it("Run の test_case_id は number 型", () => {
      expectTypeOf<Run["test_case_id"]>().toEqualTypeOf<number>();
    });

    it("Run の temperature は number 型", () => {
      expectTypeOf<Run["temperature"]>().toEqualTypeOf<number>();
    });

    it("Run の model は string 型", () => {
      expectTypeOf<Run["model"]>().toEqualTypeOf<string>();
    });

    it("Run の api_provider は string 型", () => {
      expectTypeOf<Run["api_provider"]>().toEqualTypeOf<string>();
    });
  });

  describe("NewRun 型", () => {
    it("NewRun は id なしで作成できる（AutoIncrement）", () => {
      const newRun: NewRun = {
        project_id: 1,
        prompt_version_id: 1,
        test_case_id: 1,
        conversation: JSON.stringify([
          { role: "user", content: "こんにちは" },
          { role: "assistant", content: "こんにちは！" },
        ]),
        execution_trace: JSON.stringify([]),
        created_at: Date.now(),
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      };
      expectTypeOf(newRun).toMatchTypeOf<NewRun>();
    });

    it("NewRun の is_best はデフォルト値があるためオプショナル", () => {
      expectTypeOf<NewRun["is_best"]>().toEqualTypeOf<boolean | undefined>();
    });

    it("NewRun の execution_profile_id は移行期間中オプショナル", () => {
      expectTypeOf<NewRun["execution_profile_id"]>().toEqualTypeOf<number | null | undefined>();
    });

    it("ベスト回答フラグを立てた NewRun を作成できる", () => {
      const bestRun: NewRun = {
        project_id: 1,
        prompt_version_id: 2,
        test_case_id: 1,
        conversation: JSON.stringify([
          { role: "user", content: "質問です" },
          { role: "assistant", content: "詳細な回答です" },
        ]),
        execution_trace: JSON.stringify([]),
        is_best: true,
        created_at: Date.now(),
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      };
      expectTypeOf(bestRun).toMatchTypeOf<NewRun>();
    });

    it("NewRun の project_id は number 型（必須）", () => {
      expectTypeOf<NewRun["project_id"]>().toEqualTypeOf<number>();
    });
  });

  describe("ConversationMessage 型", () => {
    it("ConversationMessage の role は user または assistant のみ許容", () => {
      expectTypeOf<ConversationMessage["role"]>().toEqualTypeOf<"user" | "assistant">();
    });

    it("ConversationMessage の content は string 型", () => {
      expectTypeOf<ConversationMessage["content"]>().toEqualTypeOf<string>();
    });

    it("ConversationMessage 配列としてマルチターン会話を表現できる", () => {
      const conversation: ConversationMessage[] = [
        { role: "user", content: "配送について教えてください" },
        { role: "assistant", content: "通常3〜5営業日でお届けします" },
        { role: "user", content: "急ぎの場合はどうすればいいですか？" },
        { role: "assistant", content: "速達オプションをご利用ください" },
      ];
      expectTypeOf(conversation).toEqualTypeOf<ConversationMessage[]>();
    });
  });
});
