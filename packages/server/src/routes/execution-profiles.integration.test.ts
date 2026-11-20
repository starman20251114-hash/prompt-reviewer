/**
 * Execution Profiles API の統合テスト（in-memory SQLite）
 *
 * execution_profiles.name の UNIQUE 制約（#209）に対して、
 * 重複する登録・変更は 409 を返し、通常の更新は従来どおり成功することを検証する。
 */
import { type DB, execution_profiles } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test-utils/create-test-db.js";
import { createExecutionProfilesRouter } from "./execution-profiles.js";

const DUPLICATE_ERROR = { error: "Execution profile name already exists" };

const baseBody = {
  model: "claude-sonnet-4-5",
  temperature: 0.7,
  api_provider: "anthropic",
} as const;

describe("Execution Profiles API の名前の重複（in-memory SQLite）", () => {
  let db: DB;
  let close: () => void;
  let app: Hono;

  beforeEach(() => {
    ({ db, close } = createTestDb());
    app = new Hono();
    app.route("/api/execution-profiles", createExecutionProfilesRouter(db));
  });

  afterEach(() => {
    close();
  });

  function post(body: Record<string, unknown>) {
    return app.request("/api/execution-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function patch(id: number, body: Record<string, unknown>) {
    return app.request(`/api/execution-profiles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function createProfile(name: string): Promise<number> {
    const res = await post({ ...baseBody, name });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: number };
    return created.id;
  }

  async function listNames(): Promise<string[]> {
    const rows = await db.select().from(execution_profiles).orderBy(execution_profiles.id);
    return rows.map((row) => row.name);
  }

  it("POST: 既存と同じ名前なら 409 を返し、行を追加しない", async () => {
    await createProfile("A");

    const res = await post({ ...baseBody, name: "A", model: "gpt-4o" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(DUPLICATE_ERROR);
    expect(await listNames()).toEqual(["A"]);
  });

  it("POST: 大文字小文字・前後の空白が違う名前は別の名前として登録できる", async () => {
    await createProfile("A");

    expect((await post({ ...baseBody, name: "a" })).status).toBe(201);
    expect((await post({ ...baseBody, name: "A " })).status).toBe(201);
    expect(await listNames()).toEqual(["A", "a", "A "]);
  });

  it("PATCH: 他のプロファイルと同じ名前への変更は 409 を返し、変更しない", async () => {
    await createProfile("A");
    const idB = await createProfile("B");

    const res = await patch(idB, { name: "A", temperature: 0.1 });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(DUPLICATE_ERROR);
    const [profileB] = await db
      .select()
      .from(execution_profiles)
      .where(eq(execution_profiles.id, idB));
    expect(profileB).toMatchObject({ id: idB, name: "B", temperature: 0.7 });
  });

  it("PATCH: 自分と同じ名前を含む更新は成功する", async () => {
    const idA = await createProfile("A");

    const res = await patch(idA, { name: "A", temperature: 0.2 });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: idA, name: "A", temperature: 0.2 });
  });

  it("PATCH: 名前を含まない更新は他に同名がなくても従来どおり成功する", async () => {
    await createProfile("A");
    const idB = await createProfile("B");

    const res = await patch(idB, { model: "gpt-4o", api_provider: "openai" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: idB,
      name: "B",
      model: "gpt-4o",
      api_provider: "openai",
    });
  });

  it("PATCH: 未使用の名前への変更は成功し、元の名前は再び使えるようになる", async () => {
    const idA = await createProfile("A");

    const res = await patch(idA, { name: "A2" });

    expect(res.status).toBe(200);
    expect(await createProfile("A")).toBeGreaterThan(idA);
    expect(await listNames()).toEqual(["A2", "A"]);
  });
});
