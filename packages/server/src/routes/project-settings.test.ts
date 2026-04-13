/**
 * ProjectSettings CRUD エンドポイントのテスト
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
import { createProjectSettingsRouter } from "./project-settings.js";

// ---- 型定義 ----

type MockSettings = {
  id: number;
  project_id: number;
  model: string;
  temperature: number;
  api_provider: string;
  created_at: number;
  updated_at: number;
};

// ---- ヘルパー ----

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/projects/:projectId/settings", createProjectSettingsRouter(db as DB));
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

const sampleSettings: MockSettings = {
  id: 1,
  project_id: 1,
  model: "claude-opus-4-5",
  temperature: 0.7,
  api_provider: "anthropic",
  created_at: 1000000,
  updated_at: 1000000,
};

// ---- GET /api/projects/:projectId/settings テスト ----

describe("GET /api/projects/:projectId/settings", () => {
  it("設定が存在しない場合に 404 を返す", async () => {
    const db = {
      ...makeSelectMock([[]]),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Settings not found");
  });

  it("設定が存在する場合に 200 で設定を返す", async () => {
    const db = {
      ...makeSelectMock([[sampleSettings]]),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockSettings;
    expect(body.project_id).toBe(1);
    expect(body.model).toBe("claude-opus-4-5");
    expect(body.temperature).toBe(0.7);
    expect(body.api_provider).toBe("anthropic");
  });

  it("数値以外の projectId に対して 400 を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/abc/settings");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid projectId");
  });
});

// ---- PUT /api/projects/:projectId/settings テスト ----

describe("PUT /api/projects/:projectId/settings", () => {
  it("設定が存在しない場合に新規作成して 201 を返す", async () => {
    const created: MockSettings = {
      id: 1,
      project_id: 1,
      model: "gpt-4o",
      temperature: 0.5,
      api_provider: "openai",
      created_at: 2000000,
      updated_at: 2000000,
    };

    const db = {
      // select で既存設定を確認 → 存在しない
      ...makeSelectMock([[]]),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.5,
        api_provider: "openai",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockSettings;
    expect(body.model).toBe("gpt-4o");
    expect(body.temperature).toBe(0.5);
    expect(body.api_provider).toBe("openai");
    expect(body.project_id).toBe(1);
  });

  it("設定が存在する場合に更新して 200 を返す", async () => {
    const updated: MockSettings = {
      ...sampleSettings,
      model: "claude-haiku-4-5",
      temperature: 1.0,
      updated_at: 3000000,
    };

    const db = {
      // select で既存設定を確認 → 存在する
      ...makeSelectMock([[sampleSettings]]),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([updated]),
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        temperature: 1.0,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockSettings;
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.temperature).toBe(1.0);
  });

  it("temperature が 0 未満の場合は 400 を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: -0.1,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("temperature が 2 を超える場合は 400 を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: 2.1,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("api_provider が不正な値の場合は 400 を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "google",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("model が空文字の場合は 400 を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("数値以外の projectId に対して 400 を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/abc/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid projectId");
  });

  it("新規作成時に project_id・created_at・updated_at が設定される", async () => {
    let capturedValues: Record<string, unknown> = {};

    const created: MockSettings = {
      id: 1,
      project_id: 2,
      model: "claude-opus-4-5",
      temperature: 0.7,
      api_provider: "anthropic",
      created_at: 4000000,
      updated_at: 4000000,
    };

    const db = {
      ...makeSelectMock([[]]),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          capturedValues = values;
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const app = buildApp(db);
    await app.request("/api/projects/2/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(capturedValues.project_id).toBe(2);
    expect(typeof capturedValues.created_at).toBe("number");
    expect(typeof capturedValues.updated_at).toBe("number");
    expect(capturedValues.created_at).toBeGreaterThan(0);
  });

  it("更新時に updated_at が現在時刻で更新される", async () => {
    let capturedUpdateData: Record<string, unknown> = {};

    const updated: MockSettings = {
      ...sampleSettings,
      updated_at: 9999999,
    };

    const db = {
      ...makeSelectMock([[sampleSettings]]),
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

    const app = buildApp(db);
    await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(typeof capturedUpdateData.updated_at).toBe("number");
    expect(capturedUpdateData.updated_at).toBeGreaterThan(0);
  });

  it("temperature が境界値（0）の場合は正常に処理される", async () => {
    const created: MockSettings = {
      ...sampleSettings,
      temperature: 0,
    };

    const db = {
      ...makeSelectMock([[]]),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: 0,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockSettings;
    expect(body.temperature).toBe(0);
  });

  it("temperature が境界値（2）の場合は正常に処理される", async () => {
    const created: MockSettings = {
      ...sampleSettings,
      temperature: 2,
    };

    const db = {
      ...makeSelectMock([[]]),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: 2,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockSettings;
    expect(body.temperature).toBe(2);
  });
});
