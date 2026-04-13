/**
 * Run CRUD + ベスト回答フラグ エンドポイントのテスト
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
import { createRunsRouter } from "./runs.js";

// ---- 型定義 ----

type MockConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

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

// ---- ヘルパー ----

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/projects/:projectId/runs", createRunsRouter(db as DB));
  return app;
}

// ---- テストデータ ----

const sampleConversation: MockConversationMessage[] = [
  { role: "user", content: "こんにちは" },
  { role: "assistant", content: "こんにちは！どのようにお手伝いできますか？" },
];

const sampleRun: MockRun = {
  id: 1,
  project_id: 1,
  prompt_version_id: 1,
  test_case_id: 1,
  conversation: JSON.stringify(sampleConversation),
  is_best: false,
  created_at: 1000000,
  model: "claude-sonnet-4-6",
  temperature: 0.7,
  api_provider: "anthropic",
};

// ---- テスト ----

describe("GET /api/projects/:projectId/runs", () => {
  it("Run一覧を200で返す", async () => {
    const runs = [sampleRun, { ...sampleRun, id: 2 }];

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(runs),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<MockRun & { conversation: MockConversationMessage[] }>;
    expect(body).toHaveLength(2);
  });

  it("Runが0件のとき空配列を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs");

    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(0);
  });

  it("conversationがJSONパースされて返される", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleRun]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<MockRun & { conversation: MockConversationMessage[] }>;
    expect(body.at(0)?.conversation).toEqual(sampleConversation);
  });

  it("prompt_version_idでフィルタリングできる", async () => {
    const filteredRuns = [sampleRun];

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(filteredRuns),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs?prompt_version_id=1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<MockRun & { conversation: MockConversationMessage[] }>;
    expect(body).toHaveLength(1);
    expect(body.at(0)?.prompt_version_id).toBe(1);
  });

  it("test_case_idでフィルタリングできる", async () => {
    const filteredRuns = [sampleRun];

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(filteredRuns),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs?test_case_id=1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<MockRun & { conversation: MockConversationMessage[] }>;
    expect(body).toHaveLength(1);
    expect(body.at(0)?.test_case_id).toBe(1);
  });

  it("数値以外のprompt_version_idに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs?prompt_version_id=abc");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid prompt_version_id");
  });

  it("数値以外のtest_case_idに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs?test_case_id=abc");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid test_case_id");
  });
});

describe("POST /api/projects/:projectId/runs", () => {
  it("バリデーション通過時に201でRunを返す", async () => {
    const created = { ...sampleRun };

    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        conversation: sampleConversation,
        model: "claude-sonnet-4-6",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockRun & { conversation: MockConversationMessage[] };
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.conversation).toEqual(sampleConversation);
  });

  it("is_bestがfalseで初期化される", async () => {
    const created = { ...sampleRun, is_best: false };

    const db = {
      insert: () => ({
        values: (values: { is_best: boolean }) => ({
          returning: () => {
            expect(values.is_best).toBe(false);
            return Promise.resolve([created]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        conversation: sampleConversation,
        model: "claude-sonnet-4-6",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockRun;
    expect(body.is_best).toBe(false);
  });

  it("conversationが空配列のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        conversation: [],
        model: "claude-sonnet-4-6",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("必須フィールドが未指定のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: sampleConversation,
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/projects/:projectId/runs/:id", () => {
  it("存在するIDに対して200でRunを返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleRun]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockRun & { conversation: MockConversationMessage[] };
    expect(body.id).toBe(1);
    expect(body.conversation).toEqual(sampleConversation);
  });

  it("存在しないIDに対して404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/999");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Run not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/abc");

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/projects/:projectId/runs/:id/best", () => {
  it("存在するIDに対して200でis_best=trueのRunを返す", async () => {
    const updated = { ...sampleRun, is_best: true };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleRun]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([updated]),
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/best", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockRun & { conversation: MockConversationMessage[] };
    expect(body.is_best).toBe(true);
  });

  it("同一バージョン×テストケースの既存フラグが解除される", async () => {
    const updated = { ...sampleRun, is_best: true };

    let updateCallCount = 0;
    const capturedSets: Array<{ is_best: boolean }> = [];

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleRun]),
        }),
      }),
      update: () => ({
        set: (values: { is_best: boolean }) => {
          capturedSets.push(values);
          updateCallCount++;
          return {
            where: () => ({
              returning: () => Promise.resolve([updated]),
            }),
          };
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/best", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    // updateが2回呼ばれる: 1回目は既存フラグ解除(is_best=false), 2回目はフラグ設定(is_best=true)
    expect(updateCallCount).toBe(2);
    expect(capturedSets[0]?.is_best).toBe(false);
    expect(capturedSets[1]?.is_best).toBe(true);
  });

  it("存在しないIDに対して404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/999/best", {
      method: "PATCH",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Run not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/abc/best", {
      method: "PATCH",
    });

    expect(res.status).toBe(400);
  });
});
