/**
 * Score CRUD + バージョン別集計エンドポイントのテスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * 実際のDB接続は行わず、Drizzle の DB インターフェースを模倣した
 * モックを使用してルートハンドラの動作を検証する。
 */

// better-sqlite3 のネイティブモジュールをモックしてDB初期化をブロック
vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createScoresRouter } from "./scores.js";

// ---- 型定義 ----

type MockRun = {
  id: number;
  project_id: number;
  prompt_version_id: number;
  test_case_id: number;
  conversation: string;
  is_best: boolean;
  created_at: number;
  model: string;
  temperature: number;
  api_provider: string;
};

type MockScore = {
  id: number;
  run_id: number;
  human_score: number | null;
  human_comment: string | null;
  judge_score: number | null;
  judge_reason: string | null;
  is_discarded: boolean;
  created_at: number;
  updated_at: number;
};

// ---- ヘルパー ----

function buildScoresApp(db: unknown) {
  const app = new Hono();
  app.route("/api/runs", createScoresRouter(db as DB));
  return app;
}

/**
 * select().from().where() を n 回呼べるモックを作成する
 * 各呼び出しに対して results[i] を返す
 */
function makeSelectMock(results: unknown[][]) {
  let callIndex = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const result = results[callIndex] ?? [];
          callIndex++;
          return Promise.resolve(result);
        },
      }),
    }),
  };
}

// ---- テストデータ ----

const sampleRun: MockRun = {
  id: 1,
  project_id: 1,
  prompt_version_id: 1,
  test_case_id: 1,
  conversation: JSON.stringify([{ role: "user", content: "test" }]),
  is_best: false,
  created_at: 1000000,
  model: "claude-sonnet-4-6",
  temperature: 0.7,
  api_provider: "anthropic",
};

const sampleScore: MockScore = {
  id: 1,
  run_id: 1,
  human_score: 4,
  human_comment: "良い回答",
  judge_score: null,
  judge_reason: null,
  is_discarded: false,
  created_at: 1000000,
  updated_at: 1000000,
};

// ---- POST /api/runs/:runId/score テスト ----

describe("POST /api/runs/:runId/score", () => {
  it("Run が存在しスコア未登録の場合、201でスコアを返す", async () => {
    const created = { ...sampleScore };

    const db = {
      // 1回目: Run の存在確認 → Run を返す / 2回目: 既存スコア確認 → 空
      ...makeSelectMock([[sampleRun], []]),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/1/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        human_score: 4,
        human_comment: "良い回答",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockScore;
    expect(body.human_score).toBe(4);
    expect(body.run_id).toBe(1);
    expect(body.is_discarded).toBe(false);
  });

  it("スコアが既に存在する場合は 409 を返す", async () => {
    const db = {
      // 1回目: Run の存在確認 → Run を返す / 2回目: 既存スコア確認 → 既存あり
      ...makeSelectMock([[sampleRun], [sampleScore]]),
    };

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/1/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        human_score: 3,
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Score already exists for this Run");
  });

  it("Run が存在しない場合は 404 を返す", async () => {
    const db = {
      // 1回目: Run の存在確認 → 存在しない
      ...makeSelectMock([[]]),
    };

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/999/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        human_score: 3,
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Run not found");
  });

  it("数値以外の runId に対して 400 を返す", async () => {
    const db = {};

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/abc/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_score: 3 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid runId");
  });

  it("human_score が範囲外（1〜100以外）の場合は 400 を返す", async () => {
    const db = {};

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/1/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_score: 101 }),
    });

    expect(res.status).toBe(400);
  });

  it("スコアフィールドなしで作成する場合（全フィールド任意）、201 で返す", async () => {
    const created = { ...sampleScore, human_score: null, human_comment: null };

    const db = {
      // 1回目: Run の存在確認 → Run を返す / 2回目: 既存スコア確認 → 空
      ...makeSelectMock([[sampleRun], []]),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/1/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
  });

  it("is_discarded が false で初期化される", async () => {
    const created = { ...sampleScore, is_discarded: false };

    let capturedValues: Record<string, unknown> = {};

    const db = {
      ...makeSelectMock([[sampleRun], []]),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          capturedValues = values;
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const app = buildScoresApp(db);
    await app.request("/api/runs/1/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_score: 3 }),
    });

    expect(capturedValues.is_discarded).toBe(false);
  });
});

// ---- PATCH /api/runs/:runId/score テスト ----

describe("PATCH /api/runs/:runId/score", () => {
  it("存在するスコアを更新して 200 で返す", async () => {
    const updated = { ...sampleScore, human_score: 5, updated_at: 2000000 };

    const db = {
      // 1回目: Run の存在確認 / 2回目: スコアの存在確認
      ...makeSelectMock([[sampleRun], [sampleScore]]),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([updated]),
          }),
        }),
      }),
    };

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/1/score", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_score: 5 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockScore;
    expect(body.human_score).toBe(5);
  });

  it("is_discarded フラグを更新できる", async () => {
    const updated = { ...sampleScore, is_discarded: true, updated_at: 2000000 };

    let capturedUpdateData: Record<string, unknown> = {};

    const db = {
      ...makeSelectMock([[sampleRun], [sampleScore]]),
      update: () => ({
        set: (data: Record<string, unknown>) => {
          capturedUpdateData = data;
          return {
            where: () => ({
              returning: () => Promise.resolve([updated]),
            }),
          };
        },
      }),
    };

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/1/score", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_discarded: true }),
    });

    expect(res.status).toBe(200);
    expect(capturedUpdateData.is_discarded).toBe(true);
    const body = (await res.json()) as MockScore;
    expect(body.is_discarded).toBe(true);
  });

  it("Run が存在しない場合は 404 を返す", async () => {
    const db = {
      // 1回目: Run の存在確認 → 存在しない
      ...makeSelectMock([[]]),
    };

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/999/score", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_score: 3 }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Run not found");
  });

  it("スコアが存在しない場合は 404 を返す", async () => {
    const db = {
      // 1回目: Run の存在確認 → Run を返す / 2回目: スコア確認 → 存在しない
      ...makeSelectMock([[sampleRun], []]),
    };

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/1/score", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_score: 3 }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Score not found for this Run");
  });

  it("数値以外の runId に対して 400 を返す", async () => {
    const db = {};

    const app = buildScoresApp(db);
    const res = await app.request("/api/runs/abc/score", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_score: 3 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid runId");
  });

  it("updated_at が更新時刻に設定される", async () => {
    const updated = { ...sampleScore, updated_at: 9999999 };

    let capturedUpdateData: Record<string, unknown> = {};

    const db = {
      ...makeSelectMock([[sampleRun], [sampleScore]]),
      update: () => ({
        set: (data: Record<string, unknown>) => {
          capturedUpdateData = data;
          return {
            where: () => ({
              returning: () => Promise.resolve([updated]),
            }),
          };
        },
      }),
    };

    const app = buildScoresApp(db);
    await app.request("/api/runs/1/score", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_score: 3 }),
    });

    // updated_at は現在時刻（数値）で設定される
    expect(typeof capturedUpdateData.updated_at).toBe("number");
    expect(capturedUpdateData.updated_at).toBeGreaterThan(0);
  });
});
