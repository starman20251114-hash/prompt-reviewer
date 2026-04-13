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
import { createScoresRouter, createVersionSummaryRouter } from "./scores.js";

// ---- 型定義 ----

type MockRun = {
  id: number;
  project_id: number;
  prompt_version_id: number;
  test_case_id: number;
  conversation: string;
  is_best: number;
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
  is_discarded: number;
  created_at: number;
  updated_at: number;
};

// ---- ヘルパー ----

function buildScoresApp(db: unknown) {
  const app = new Hono();
  app.route("/api/runs", createScoresRouter(db as DB));
  return app;
}

function buildSummaryApp(db: unknown) {
  const app = new Hono();
  app.route("/api/projects/:projectId/prompt-versions", createVersionSummaryRouter(db as DB));
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
  is_best: 0,
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
  is_discarded: 0,
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
    expect(body.is_discarded).toBe(0);
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

  it("is_discarded が 0 で初期化される", async () => {
    const created = { ...sampleScore, is_discarded: 0 };

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

    expect(capturedValues.is_discarded).toBe(0);
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
    const updated = { ...sampleScore, is_discarded: 1, updated_at: 2000000 };

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
      body: JSON.stringify({ is_discarded: 1 }),
    });

    expect(res.status).toBe(200);
    expect(capturedUpdateData.is_discarded).toBe(1);
    const body = (await res.json()) as MockScore;
    expect(body.is_discarded).toBe(1);
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

// ---- GET /api/projects/:projectId/prompt-versions/:id/summary テスト ----

describe("GET /api/projects/:projectId/prompt-versions/:id/summary", () => {
  it("Run が存在しない場合は runCount=0、スコアは null を返す", async () => {
    const db = {
      // 1回目: versionRuns の取得 → 空
      ...makeSelectMock([[]]),
    };

    const app = buildSummaryApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/1/summary");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      versionId: number;
      avgHumanScore: null;
      avgJudgeScore: null;
      runCount: number;
      scoredCount: number;
    };
    expect(body.versionId).toBe(1);
    expect(body.runCount).toBe(0);
    expect(body.scoredCount).toBe(0);
    expect(body.avgHumanScore).toBeNull();
    expect(body.avgJudgeScore).toBeNull();
  });

  it("is_discarded=false のスコアのみ集計する", async () => {
    // Run が3件ある
    const versionRuns = [{ id: 1 }, { id: 2 }, { id: 3 }];

    // is_discarded=0 のスコア（DBクエリで is_discarded=0 にフィルタ済み）
    const validScores = [
      { id: 1, run_id: 1, human_score: 4, judge_score: null, is_discarded: 0 },
      { id: 2, run_id: 2, human_score: 2, judge_score: 5, is_discarded: 0 },
      // run_id=3 はスコア未評価
    ];

    const db = {
      // 1回目: versionRuns の取得 / 2回目: is_discarded=0 のスコア取得
      ...makeSelectMock([versionRuns, validScores]),
    };

    const app = buildSummaryApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/1/summary");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      versionId: number;
      avgHumanScore: number | null;
      avgJudgeScore: number | null;
      runCount: number;
      scoredCount: number;
    };

    expect(body.versionId).toBe(1);
    expect(body.runCount).toBe(3);
    // Run1(4) + Run2(2) の平均 = 3
    expect(body.avgHumanScore).toBe(3);
    // judge_score は Run2 のみ = 5
    expect(body.avgJudgeScore).toBe(5);
    // is_discarded=0 のスコアが 2 件
    expect(body.scoredCount).toBe(2);
  });

  it("run_id が対象バージョン外のスコアは集計に含まれない", async () => {
    // バージョン1の Run（id=1 のみ）
    const versionRuns = [{ id: 1 }];

    // is_discarded=0 のスコア（run_id=2 は別バージョンのRunだが is_discarded=0）
    const validScores = [
      { id: 1, run_id: 1, human_score: 5, judge_score: null, is_discarded: 0 },
      { id: 2, run_id: 2, human_score: 1, judge_score: null, is_discarded: 0 },
    ];

    const db = {
      // 1回目: versionRuns の取得 / 2回目: is_discarded=0 のスコア取得
      ...makeSelectMock([versionRuns, validScores]),
    };

    const app = buildSummaryApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/1/summary");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      avgHumanScore: number | null;
      runCount: number;
      scoredCount: number;
    };

    // run_id=2 は versionRuns に含まれないためフィルタされる
    expect(body.runCount).toBe(1);
    expect(body.scoredCount).toBe(1);
    // Run1 のみ集計: human_score=5
    expect(body.avgHumanScore).toBe(5);
  });

  it("human_score が全て null の場合、avgHumanScore は null を返す", async () => {
    const versionRuns = [{ id: 1 }];

    const validScores = [
      { id: 1, run_id: 1, human_score: null, judge_score: null, is_discarded: 0 },
    ];

    const db = {
      ...makeSelectMock([versionRuns, validScores]),
    };

    const app = buildSummaryApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/1/summary");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      avgHumanScore: number | null;
      avgJudgeScore: number | null;
      scoredCount: number;
    };

    expect(body.avgHumanScore).toBeNull();
    expect(body.avgJudgeScore).toBeNull();
    // スコアレコードは存在するので scoredCount=1
    expect(body.scoredCount).toBe(1);
  });

  it("数値以外の projectId に対して 400 を返す", async () => {
    const db = {};

    const app = buildSummaryApp(db);
    const res = await app.request("/api/projects/abc/prompt-versions/1/summary");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });

  it("数値以外のバージョンIDに対して 400 を返す", async () => {
    const db = {};

    const app = buildSummaryApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/abc/summary");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });

  it("複数 Run の avgHumanScore が正確に計算される", async () => {
    const versionRuns = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

    // human_score: 1, 3, 5 → 平均 = 3.0（id=4のRunはスコアなし）
    const validScores = [
      { id: 1, run_id: 1, human_score: 1, judge_score: null, is_discarded: 0 },
      { id: 2, run_id: 2, human_score: 3, judge_score: null, is_discarded: 0 },
      { id: 3, run_id: 3, human_score: 5, judge_score: null, is_discarded: 0 },
    ];

    const db = {
      ...makeSelectMock([versionRuns, validScores]),
    };

    const app = buildSummaryApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/1/summary");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runCount: number;
      scoredCount: number;
      avgHumanScore: number | null;
    };

    expect(body.runCount).toBe(4);
    expect(body.scoredCount).toBe(3);
    expect(body.avgHumanScore).toBe(3);
  });
});
