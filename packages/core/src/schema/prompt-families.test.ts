import { describe, expectTypeOf, it } from "vitest";
import type { NewPromptFamily, PromptFamily } from "./prompt-families.js";

describe("prompt_families スキーマ型定義", () => {
  it("PromptFamily 型は基本フィールドを持つ", () => {
    type RequiredFields = {
      id: number;
      created_at: number;
      updated_at: number;
    };

    expectTypeOf<
      Pick<PromptFamily, "id" | "created_at" | "updated_at">
    >().toMatchTypeOf<RequiredFields>();
  });

  it("PromptFamily の name と description は null 許容", () => {
    expectTypeOf<PromptFamily["name"]>().toEqualTypeOf<string | null>();
    expectTypeOf<PromptFamily["description"]>().toEqualTypeOf<string | null>();
  });

  it("NewPromptFamily は id なしで作成できる", () => {
    const family: NewPromptFamily = {
      name: "返金対応",
      description: "返金問い合わせ用プロンプト系列",
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    expectTypeOf(family).toMatchTypeOf<NewPromptFamily>();
  });
});
