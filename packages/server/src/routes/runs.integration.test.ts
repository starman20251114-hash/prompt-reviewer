/**
 * Runs API の統合テスト（in-memory SQLite）
 *
 * runs.test.ts はモックDBを使うため、where 条件が実際に効いているかを検証できない。
 * ここでは実際のSQLiteにマイグレーションを適用し、APIの応答結果でフィルタ処理を検証する。
 */
import { type DB, prompt_families, prompt_versions, runs } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test-utils/create-test-db.js";
import { createRunsRouter } from "./runs.js";

describe("GET /api/runs（in-memory SQLite）", () => {
  let db: DB;
  let close: () => void;

  beforeEach(() => {
    ({ db, close } = createTestDb());
  });

  afterEach(() => {
    close();
  });

  it("prompt_version_id を指定すると、そのバージョンの Run だけを返す", async () => {
    const now = 1_000_000;
    const [family] = await db
      .insert(prompt_families)
      .values({ name: "family", created_at: now, updated_at: now })
      .returning();
    if (!family) throw new Error("prompt_family の作成に失敗しました");

    const [targetVersion, otherVersion] = await db
      .insert(prompt_versions)
      .values([
        { prompt_family_id: family.id, version: 1, content: "v1", created_at: now },
        { prompt_family_id: family.id, version: 2, content: "v2", created_at: now },
      ])
      .returning();
    if (!targetVersion || !otherVersion) throw new Error("prompt_version の作成に失敗しました");

    const runBase = {
      prompt_snapshot: "snapshot",
      conversation: "[]",
      created_at: now,
      model: "test-model",
      temperature: 0.7,
      api_provider: "anthropic",
    };
    const insertedRuns = await db
      .insert(runs)
      .values([
        { ...runBase, prompt_version_id: targetVersion.id },
        { ...runBase, prompt_version_id: otherVersion.id },
        { ...runBase, prompt_version_id: targetVersion.id },
      ])
      .returning();
    const expectedRunIds = insertedRuns
      .filter((run) => run.prompt_version_id === targetVersion.id)
      .map((run) => run.id)
      .sort((a, b) => a - b);

    const app = new Hono();
    app.route("/api/runs", createRunsRouter(db));
    const res = await app.request(`/api/runs?prompt_version_id=${targetVersion.id}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: number; prompt_version_id: number }>;
    expect(body.map((run) => run.id).sort((a, b) => a - b)).toEqual(expectedRunIds);
    expect(body.every((run) => run.prompt_version_id === targetVersion.id)).toBe(true);
  });
});
