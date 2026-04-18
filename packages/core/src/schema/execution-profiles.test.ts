import { describe, expectTypeOf, it } from "vitest";
import type { ExecutionProfile, NewExecutionProfile } from "./execution-profiles.js";

describe("execution_profiles スキーマ型定義", () => {
  it("ExecutionProfile の必須フィールド型が正しい", () => {
    type RequiredFields = {
      id: number;
      name: string;
      model: string;
      temperature: number;
      api_provider: "anthropic" | "openai";
      created_at: number;
      updated_at: number;
    };

    expectTypeOf<
      Pick<
        ExecutionProfile,
        "id" | "name" | "model" | "temperature" | "api_provider" | "created_at" | "updated_at"
      >
    >().toMatchTypeOf<RequiredFields>();
  });

  it("ExecutionProfile の description は null 許容", () => {
    expectTypeOf<ExecutionProfile["description"]>().toEqualTypeOf<string | null>();
  });

  it("NewExecutionProfile はデフォルト付きカラムを省略できる", () => {
    const profile: NewExecutionProfile = {
      name: "Claude デフォルト",
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    expectTypeOf(profile).toMatchTypeOf<NewExecutionProfile>();
  });
});
