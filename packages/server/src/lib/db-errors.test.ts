import { type DB, execution_profiles } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test-utils/create-test-db.js";
import { isUniqueConstraintError } from "./db-errors.js";

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("例外が発生しませんでした");
}

describe("isUniqueConstraintError（in-memory SQLite）", () => {
  let db: DB;
  let close: () => void;
  const values = {
    name: "A",
    model: "m",
    temperature: 0.7,
    api_provider: "anthropic" as const,
    created_at: 1,
    updated_at: 1,
  };

  beforeEach(() => {
    ({ db, close } = createTestDb());
  });

  afterEach(() => {
    close();
  });

  it("drizzle 経由の INSERT で発生した UNIQUE 制約違反を判定できる", async () => {
    await db.insert(execution_profiles).values(values);

    const error = await captureError(() => db.insert(execution_profiles).values(values));

    expect(isUniqueConstraintError(error)).toBe(true);
  });

  it("drizzle 経由の UPDATE で発生した UNIQUE 制約違反を判定できる", async () => {
    await db.insert(execution_profiles).values(values);
    await db.insert(execution_profiles).values({ ...values, name: "B" });

    const error = await captureError(() =>
      db.update(execution_profiles).set({ name: "A" }).where(eq(execution_profiles.name, "B")),
    );

    expect(isUniqueConstraintError(error)).toBe(true);
  });

  it("NOT NULL 制約違反は UNIQUE 制約違反として扱わない", async () => {
    const error = await captureError(() =>
      db.insert(execution_profiles).values({ ...values, name: null as unknown as string }),
    );

    expect(isUniqueConstraintError(error)).toBe(false);
  });
});

describe("isUniqueConstraintError（エラーの形）", () => {
  it("code が SQLITE_CONSTRAINT_UNIQUE のエラーを判定できる", () => {
    expect(
      isUniqueConstraintError(Object.assign(new Error("x"), { code: "SQLITE_CONSTRAINT_UNIQUE" })),
    ).toBe(true);
  });

  it("cause に包まれたエラーも判定できる", () => {
    const inner = Object.assign(new Error("x"), { code: "SQLITE_CONSTRAINT_UNIQUE" });
    expect(isUniqueConstraintError(new Error("wrapped", { cause: inner }))).toBe(true);
  });

  it("関係のないエラーや値は false", () => {
    expect(isUniqueConstraintError(new Error("UNIQUE"))).toBe(false);
    expect(
      isUniqueConstraintError(
        Object.assign(new Error("x"), { code: "SQLITE_CONSTRAINT_PRIMARYKEY" }),
      ),
    ).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError("SQLITE_CONSTRAINT_UNIQUE")).toBe(false);
  });

  it("cause が循環していても無限ループしない", () => {
    const error = new Error("loop") as Error & { cause?: unknown };
    error.cause = error;
    expect(isUniqueConstraintError(error)).toBe(false);
  });
});
