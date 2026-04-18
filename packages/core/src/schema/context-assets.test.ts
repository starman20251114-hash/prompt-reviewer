import { describe, expectTypeOf, it } from "vitest";
import type { ContextAsset, NewContextAsset } from "./context-assets.js";

describe("context_assets スキーマ型定義", () => {
  it("ContextAsset の必須フィールド型が正しい", () => {
    type RequiredFields = {
      id: number;
      name: string;
      path: string;
      content: string;
      mime_type: string;
      created_at: number;
      updated_at: number;
    };

    expectTypeOf<
      Pick<
        ContextAsset,
        "id" | "name" | "path" | "content" | "mime_type" | "created_at" | "updated_at"
      >
    >().toMatchTypeOf<RequiredFields>();
  });

  it("ContextAsset の content_hash は null 許容", () => {
    expectTypeOf<ContextAsset["content_hash"]>().toEqualTypeOf<string | null>();
  });

  it("NewContextAsset は id なしで作成できる", () => {
    const asset: NewContextAsset = {
      name: "refund-policy.md",
      path: "policies/refund-policy.md",
      content: "購入から30日以内であれば返金可能です。",
      mime_type: "text/markdown",
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    expectTypeOf(asset).toMatchTypeOf<NewContextAsset>();
  });
});
