/**
 * TestCase スキーマの型定義テスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * ここではDBへの実際の接続なしにスキーマの型安全性のみを検証する。
 * マイグレーションの動作検証は `pnpm run migrate` で別途確認済み。
 */
import { describe, expectTypeOf, it } from "vitest";
import type { NewTestCase, TestCase, Turn } from "./test-cases.js";

describe("test_cases スキーマ型定義", () => {
  describe("TestCase 型", () => {
    it("TestCase 型は必須フィールドを持つ（project_idを除く独立資産構造）", () => {
      type RequiredFields = {
        id: number;
        title: string;
        turns: string;
        context_content: string;
        display_order: number;
        created_at: number;
        updated_at: number;
      };
      expectTypeOf<
        Pick<
          TestCase,
          | "id"
          | "title"
          | "turns"
          | "context_content"
          | "display_order"
          | "created_at"
          | "updated_at"
        >
      >().toMatchTypeOf<RequiredFields>();
    });

    it("TestCase 型は project_id フィールドを持たない（独立資産モデル）", () => {
      // project_id は test_case_projects 中間テーブルで管理する
      type HasNoProjectId = "project_id" extends keyof TestCase ? true : false;
      expectTypeOf<HasNoProjectId>().toEqualTypeOf<false>();
    });

    it("TestCase の expected_description はオプショナル（null許容）", () => {
      expectTypeOf<TestCase["expected_description"]>().toEqualTypeOf<string | null>();
    });

    it("TestCase の turns は string 型（JSONシリアライズ済み）", () => {
      expectTypeOf<TestCase["turns"]>().toEqualTypeOf<string>();
    });

    it("TestCase の context_content は string 型", () => {
      expectTypeOf<TestCase["context_content"]>().toEqualTypeOf<string>();
    });

    it("TestCase の display_order は number 型", () => {
      expectTypeOf<TestCase["display_order"]>().toEqualTypeOf<number>();
    });

    it("TestCase の title は string 型", () => {
      expectTypeOf<TestCase["title"]>().toEqualTypeOf<string>();
    });
  });

  describe("NewTestCase 型", () => {
    it("NewTestCase は id なしで作成できる（AutoIncrement）", () => {
      const newTestCase: NewTestCase = {
        title: "マルチターンテストケース",
        turns: JSON.stringify([
          { role: "user", content: "こんにちは" },
          { role: "assistant", content: "こんにちは！" },
        ]),
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      expectTypeOf(newTestCase).toMatchTypeOf<NewTestCase>();
    });

    it("NewTestCase は project_id を持たない（独立資産モデル）", () => {
      type HasNoProjectId = "project_id" extends keyof NewTestCase ? true : false;
      expectTypeOf<HasNoProjectId>().toEqualTypeOf<false>();
    });

    it("NewTestCase の context_content はデフォルト値があるためオプショナル", () => {
      expectTypeOf<NewTestCase["context_content"]>().toEqualTypeOf<string | undefined>();
    });

    it("NewTestCase の display_order はデフォルト値があるためオプショナル", () => {
      expectTypeOf<NewTestCase["display_order"]>().toEqualTypeOf<number | undefined>();
    });

    it("NewTestCase の expected_description はオプショナル", () => {
      expectTypeOf<NewTestCase["expected_description"]>().toEqualTypeOf<
        string | null | undefined
      >();
    });
  });

  describe("Turn 型", () => {
    it("Turn の role は user または assistant のみ許容", () => {
      expectTypeOf<Turn["role"]>().toEqualTypeOf<"user" | "assistant">();
    });

    it("Turn の content は string 型", () => {
      expectTypeOf<Turn["content"]>().toEqualTypeOf<string>();
    });

    it("Turn 配列としてマルチターン会話を表現できる", () => {
      const turns: Turn[] = [
        { role: "user", content: "質問です" },
        { role: "assistant", content: "回答です" },
        { role: "user", content: "フォローアップ質問" },
      ];
      expectTypeOf(turns).toEqualTypeOf<Turn[]>();
    });
  });
});
