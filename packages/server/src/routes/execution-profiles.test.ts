vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import { LLMAuthenticationError } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createExecutionProfilesRouter } from "./execution-profiles.js";

type MockExecutionProfile = {
  id: number;
  name: string;
  description: string | null;
  model: string;
  temperature: number;
  api_provider: "anthropic" | "openai";
  created_at: number;
  updated_at: number;
};

type ModelListClient = {
  listModels(): Promise<unknown[]>;
};

function buildApp(
  db: unknown,
  options?: {
    modelClientFactory?: (body: {
      api_provider: "anthropic" | "openai";
      api_key: string;
    }) => ModelListClient | null;
  },
) {
  const app = new Hono();
  app.route("/api/execution-profiles", createExecutionProfilesRouter(db as DB, options));
  return app;
}

const sampleProfile: MockExecutionProfile = {
  id: 1,
  name: "Claude Sonnet 低温度",
  description: "比較用の低温度設定",
  model: "claude-sonnet-4-5",
  temperature: 0.2,
  api_provider: "anthropic",
  created_at: 1000000,
  updated_at: 1000000,
};

describe("GET /api/execution-profiles", () => {
  it("一覧を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          orderBy: () => Promise.resolve([sampleProfile]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/execution-profiles");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([sampleProfile]);
  });
});

describe("POST /api/execution-profiles", () => {
  it("新規作成して 201 を返す", async () => {
    const created: MockExecutionProfile = {
      ...sampleProfile,
      id: 2,
      name: "GPT-4o high temp",
      description: null,
      model: "gpt-4o",
      temperature: 1.2,
      api_provider: "openai",
    };
    let capturedValues: Record<string, unknown> = {};

    const db = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          capturedValues = values;
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const res = await buildApp(db).request("/api/execution-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "GPT-4o high temp",
        description: null,
        model: "gpt-4o",
        temperature: 1.2,
        api_provider: "openai",
      }),
    });

    expect(res.status).toBe(201);
    expect(capturedValues.name).toBe("GPT-4o high temp");
    expect(capturedValues.description).toBeNull();
    expect(typeof capturedValues.created_at).toBe("number");
    expect(typeof capturedValues.updated_at).toBe("number");
    await expect(res.json()).resolves.toEqual(created);
  });

  it("temperature が範囲外なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/execution-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "bad",
        model: "claude",
        temperature: 2.5,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/execution-profiles/:id", () => {
  it("詳細を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleProfile]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/execution-profiles/1");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(sampleProfile);
  });

  it("見つからない場合は 404 を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/execution-profiles/999");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Execution profile not found" });
  });
});

describe("PATCH /api/execution-profiles/:id", () => {
  it("更新して 200 を返す", async () => {
    const updated: MockExecutionProfile = {
      ...sampleProfile,
      name: "Claude Sonnet 高温度",
      temperature: 0.9,
      updated_at: 2000000,
    };
    let selectCount = 0;
    let capturedValues: Record<string, unknown> = {};

    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCount += 1;
            return Promise.resolve(selectCount === 1 ? [sampleProfile] : []);
          },
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          capturedValues = values;
          return {
            where: () => ({
              returning: () => Promise.resolve([updated]),
            }),
          };
        },
      }),
    };

    const res = await buildApp(db).request("/api/execution-profiles/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Claude Sonnet 高温度",
        temperature: 0.9,
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedValues.name).toBe("Claude Sonnet 高温度");
    expect(capturedValues.temperature).toBe(0.9);
    expect(typeof capturedValues.updated_at).toBe("number");
    await expect(res.json()).resolves.toEqual(updated);
  });

  it("対象が存在しない場合は 404 を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/execution-profiles/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temperature: 0.9,
      }),
    });

    expect(res.status).toBe(404);
  });

  it("更新項目が空なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/execution-profiles/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/execution-profiles/:id", () => {
  it("参照中の Run を切り離してから削除し 204 を返す", async () => {
    let deleteCalled = false;
    let updateRunsCalled = false;
    let clearedExecutionProfileId: number | null | undefined;
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleProfile]),
        }),
      }),
      update: () => ({
        set: (values: { execution_profile_id: number | null }) => {
          updateRunsCalled = true;
          clearedExecutionProfileId = values.execution_profile_id;
          return {
            where: () => Promise.resolve(),
          };
        },
      }),
      delete: () => ({
        where: () => {
          deleteCalled = true;
          return Promise.resolve();
        },
      }),
    };

    const res = await buildApp(db).request("/api/execution-profiles/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(updateRunsCalled).toBe(true);
    expect(clearedExecutionProfileId).toBeNull();
    expect(deleteCalled).toBe(true);
  });

  it("数値以外の ID なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/execution-profiles/abc", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid ID" });
  });
});

describe("POST /api/execution-profiles/models", () => {
  it("モデル一覧を返す", async () => {
    const listModels = vi.fn().mockResolvedValue([
      {
        id: "claude-sonnet-4-5-20250929",
        displayName: "Claude Sonnet 4.5",
      },
    ]);
    const modelClientFactory = vi.fn().mockReturnValue({ listModels });

    const res = await buildApp({}, { modelClientFactory }).request(
      "/api/execution-profiles/models",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_provider: "anthropic",
          api_key: "sk-ant-test",
        }),
      },
    );

    expect(res.status).toBe(200);
    expect(modelClientFactory).toHaveBeenCalledWith({
      api_provider: "anthropic",
      api_key: "sk-ant-test",
    });
    await expect(res.json()).resolves.toEqual({
      models: [
        {
          id: "claude-sonnet-4-5-20250929",
          displayName: "Claude Sonnet 4.5",
        },
      ],
    });
  });

  it("未対応プロバイダーなら 501 を返す", async () => {
    const res = await buildApp({}, { modelClientFactory: () => null }).request(
      "/api/execution-profiles/models",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_provider: "openai",
          api_key: "sk-test",
        }),
      },
    );

    expect(res.status).toBe(501);
  });

  it("認証エラーなら 401 を返す", async () => {
    const res = await buildApp(
      {},
      {
        modelClientFactory: () => ({
          listModels: vi.fn().mockRejectedValue(new LLMAuthenticationError("invalid api key")),
        }),
      },
    ).request("/api/execution-profiles/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_provider: "anthropic",
        api_key: "bad-key",
      }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid api key" });
  });
});
