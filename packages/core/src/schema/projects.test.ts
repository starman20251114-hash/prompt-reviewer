/**
 * Drizzleスキーマの型定義テスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * ここではDBへの実際の接続なしにスキーマの型安全性のみを検証する。
 * マイグレーションの動作検証は `pnpm run migrate` で別途確認済み。
 */
import { describe, expectTypeOf, it } from "vitest";
import type { NewProject, NewProjectSettings, Project, ProjectSettings } from "./projects.js";

describe("projects スキーマ型定義", () => {
  describe("Project 型", () => {
    it("Project 型は必須フィールドを持つ", () => {
      type RequiredFields = {
        id: number;
        name: string;
        created_at: number;
        updated_at: number;
      };
      expectTypeOf<
        Pick<Project, "id" | "name" | "created_at" | "updated_at">
      >().toMatchTypeOf<RequiredFields>();
    });

    it("Project の description はオプショナル（null許容）", () => {
      expectTypeOf<Project["description"]>().toEqualTypeOf<string | null>();
    });
  });

  describe("NewProject 型", () => {
    it("NewProject は id なしで作成できる（AutoIncrement）", () => {
      // id を含まないオブジェクトが NewProject に代入可能であることを確認
      const newProject: NewProject = {
        name: "テストプロジェクト",
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      expectTypeOf(newProject).toMatchTypeOf<NewProject>();
    });

    it("NewProject の name は string 型", () => {
      expectTypeOf<NewProject["name"]>().toEqualTypeOf<string>();
    });
  });

  describe("ProjectSettings 型", () => {
    it("ProjectSettings は api_provider に anthropic|openai のみ許容", () => {
      expectTypeOf<ProjectSettings["api_provider"]>().toEqualTypeOf<"anthropic" | "openai">();
    });

    it("ProjectSettings は temperature に number 型", () => {
      expectTypeOf<ProjectSettings["temperature"]>().toEqualTypeOf<number>();
    });

    it("ProjectSettings は project_id に number 型", () => {
      expectTypeOf<ProjectSettings["project_id"]>().toEqualTypeOf<number>();
    });
  });

  describe("NewProjectSettings 型", () => {
    it("NewProjectSettings の api_provider はデフォルト値があるためオプショナル", () => {
      // api_provider はスキーマ上デフォルト値を持つため、Insert型ではオプショナルになる
      expectTypeOf<NewProjectSettings["api_provider"]>().toEqualTypeOf<
        "anthropic" | "openai" | undefined
      >();
    });
  });
});
