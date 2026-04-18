import { describe, expectTypeOf, it } from "vitest";
import type {
  NewPromptFamilyContextAsset,
  NewPromptVersionProject,
  NewTestCaseContextAsset,
  NewTestCaseProject,
  PromptFamilyContextAsset,
  PromptVersionProject,
  TestCaseContextAsset,
  TestCaseProject,
} from "./project-links.js";

describe("project_links スキーマ型定義", () => {
  it("TestCaseProject は複合キーの構成要素を持つ", () => {
    expectTypeOf<TestCaseProject["test_case_id"]>().toEqualTypeOf<number>();
    expectTypeOf<TestCaseProject["project_id"]>().toEqualTypeOf<number>();
    expectTypeOf<TestCaseProject["created_at"]>().toEqualTypeOf<number>();
  });

  it("PromptVersionProject は複合キーの構成要素を持つ", () => {
    expectTypeOf<PromptVersionProject["prompt_version_id"]>().toEqualTypeOf<number>();
    expectTypeOf<PromptVersionProject["project_id"]>().toEqualTypeOf<number>();
  });

  it("TestCaseContextAsset は複合キーの構成要素を持つ", () => {
    expectTypeOf<TestCaseContextAsset["test_case_id"]>().toEqualTypeOf<number>();
    expectTypeOf<TestCaseContextAsset["context_asset_id"]>().toEqualTypeOf<number>();
  });

  it("PromptFamilyContextAsset は複合キーの構成要素を持つ", () => {
    expectTypeOf<PromptFamilyContextAsset["prompt_family_id"]>().toEqualTypeOf<number>();
    expectTypeOf<PromptFamilyContextAsset["context_asset_id"]>().toEqualTypeOf<number>();
  });

  it("各中間テーブルの Insert 型を生成できる", () => {
    const testCaseProject: NewTestCaseProject = {
      test_case_id: 1,
      project_id: 2,
      created_at: Date.now(),
    };
    const promptVersionProject: NewPromptVersionProject = {
      prompt_version_id: 1,
      project_id: 2,
      created_at: Date.now(),
    };
    const testCaseContextAsset: NewTestCaseContextAsset = {
      test_case_id: 1,
      context_asset_id: 3,
      created_at: Date.now(),
    };
    const promptFamilyContextAsset: NewPromptFamilyContextAsset = {
      prompt_family_id: 1,
      context_asset_id: 3,
      created_at: Date.now(),
    };

    expectTypeOf(testCaseProject).toMatchTypeOf<NewTestCaseProject>();
    expectTypeOf(promptVersionProject).toMatchTypeOf<NewPromptVersionProject>();
    expectTypeOf(testCaseContextAsset).toMatchTypeOf<NewTestCaseContextAsset>();
    expectTypeOf(promptFamilyContextAsset).toMatchTypeOf<NewPromptFamilyContextAsset>();
  });
});
