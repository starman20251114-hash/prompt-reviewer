/**
 * PromptVersion スキーマの型定義テスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * ここではDBへの実際の接続なしにスキーマの型安全性のみを検証する。
 * マイグレーションの動作検証は `pnpm run migrate` で別途確認済み。
 */
import { describe, expectTypeOf, it } from "vitest";
import type { NewPromptVersion, PromptVersion } from "./prompt-versions.js";

describe("prompt_versions スキーマ型定義", () => {
  describe("PromptVersion 型", () => {
    it("PromptVersion の prompt_family_id は必須（number 型）", () => {
      expectTypeOf<PromptVersion["prompt_family_id"]>().toEqualTypeOf<number>();
    });

    it("PromptVersion の project_id は nullable（後方互換）", () => {
      expectTypeOf<PromptVersion["project_id"]>().toEqualTypeOf<number | null>();
    });

    it("PromptVersion の version は number 型（family 内連番）", () => {
      expectTypeOf<PromptVersion["version"]>().toEqualTypeOf<number>();
    });

    it("PromptVersion の content は string 型", () => {
      expectTypeOf<PromptVersion["content"]>().toEqualTypeOf<string>();
    });

    it("PromptVersion の name はオプショナル（null許容）", () => {
      expectTypeOf<PromptVersion["name"]>().toEqualTypeOf<string | null>();
    });

    it("PromptVersion の memo はオプショナル（null許容）", () => {
      expectTypeOf<PromptVersion["memo"]>().toEqualTypeOf<string | null>();
    });

    it("PromptVersion の parent_version_id はオプショナル（null許容・自己参照）", () => {
      expectTypeOf<PromptVersion["parent_version_id"]>().toEqualTypeOf<number | null>();
    });

    it("PromptVersion の is_selected は boolean 型", () => {
      expectTypeOf<PromptVersion["is_selected"]>().toEqualTypeOf<boolean>();
    });
  });

  describe("NewPromptVersion 型", () => {
    it("NewPromptVersion は prompt_family_id を必須として作成できる", () => {
      const newPromptVersion: NewPromptVersion = {
        prompt_family_id: 1,
        version: 1,
        content: "あなたは親切なアシスタントです。",
        created_at: Date.now(),
      };
      expectTypeOf(newPromptVersion).toMatchTypeOf<NewPromptVersion>();
    });

    it("NewPromptVersion の prompt_family_id は number 型（必須）", () => {
      expectTypeOf<NewPromptVersion["prompt_family_id"]>().toEqualTypeOf<number>();
    });

    it("NewPromptVersion の project_id はオプショナル（後方互換）", () => {
      expectTypeOf<NewPromptVersion["project_id"]>().toEqualTypeOf<number | null | undefined>();
    });

    it("NewPromptVersion の name はオプショナル", () => {
      expectTypeOf<NewPromptVersion["name"]>().toEqualTypeOf<string | null | undefined>();
    });

    it("NewPromptVersion の memo はオプショナル", () => {
      expectTypeOf<NewPromptVersion["memo"]>().toEqualTypeOf<string | null | undefined>();
    });

    it("NewPromptVersion の parent_version_id はオプショナル（分岐元なし可）", () => {
      expectTypeOf<NewPromptVersion["parent_version_id"]>().toEqualTypeOf<
        number | null | undefined
      >();
    });

    it("分岐バージョンは parent_version_id を指定して作成できる", () => {
      const branchedVersion: NewPromptVersion = {
        prompt_family_id: 1,
        version: 2,
        content: "あなたは丁寧なアシスタントです。",
        parent_version_id: 1,
        created_at: Date.now(),
      };
      expectTypeOf(branchedVersion).toMatchTypeOf<NewPromptVersion>();
    });

    it("名前付きバージョンは name を指定して作成できる", () => {
      const namedVersion: NewPromptVersion = {
        prompt_family_id: 1,
        version: 3,
        name: "丁寧口調バージョン",
        memo: "語尾を丁寧語に変更した改善版",
        content: "あなたは丁寧で親切なアシスタントです。",
        created_at: Date.now(),
      };
      expectTypeOf(namedVersion).toMatchTypeOf<NewPromptVersion>();
    });
  });
});
