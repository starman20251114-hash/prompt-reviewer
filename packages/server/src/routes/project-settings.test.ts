/**
 * ProjectSettings CRUD エンドポイントのテスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * 実際のDB接続は行わず、Drizzle の DB インターフェースを模倣した
 * モックを使用してルートハンドラの動作を検証する。
 *
 * db.transaction() は同期コールバックを受け取り、その返り値をそのまま返す。
 * テスト内のモック transaction も同様に (fn) => fn(tx) の形で実装する。
 *
 * 同期ドライバ（better-sqlite3）では .returning().all() で結果配列を取得するため、
 * モックの .returning() も .all() メソッドを持つオブジェクトを返す必要がある。
 */

// better-sqlite3 のネイティブモジュールをモックしてDB初期化をブロック
vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import { execution_profiles, project_settings } from "@prompt-reviewer/core";
import { LLMAuthenticationError } from "@prompt-reviewer/core";
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

type ModelListClient = {
  listModels(): Promise<unknown[]>;
};

// ---- ヘルパー ----

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
  app.route("/api/projects/:projectId/settings", createProjectSettingsRouter(db as DB, options));
  return app;
}

/**
 * select().from().where() のモックを作成する。
 * from() に渡されたテーブルオブジェクトで結果を識別する。
 */
function makeSelectMock(resultsByTable: Map<unknown, unknown[]>) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          return Promise.resolve(resultsByTable.get(table) ?? []);
        },
      }),
    }),
  };
}

/**
 * db.transaction() のモックを作成する。
 * better-sqlite3 の transaction は同期なので、コールバックを直接呼び出して返り値を返す。
 */
function makeTransactionMock(tx: unknown) {
  return (fn: (tx: unknown) => unknown) => fn(tx);
}

/**
 * .returning() チェーンの末尾に .all() メソッドを持つオブジェクトを返すヘルパー。
 * 同期ドライバ（better-sqlite3）では .returning().all() で結果配列を取得する。
 */
function makeReturning(rows: unknown[]) {
  return { all: () => rows };
}

function makeInsertTxMock(options: {
  projectSettingsRows?: unknown[];
  executionProfileRows?: unknown[];
  onExecutionProfileInsert?: (values: Record<string, unknown>) => void;
  onExecutionProfileUpdate?: (values: Record<string, unknown>) => void;
  onProjectSettingsValues?: (values: Record<string, unknown>) => void;
}) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          all: () => (table === execution_profiles ? (options.executionProfileRows ?? []) : []),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === execution_profiles) {
          return {
            run: () => options.onExecutionProfileInsert?.(values),
          };
        }

        if (table === project_settings) {
          options.onProjectSettingsValues?.(values);
          return {
            returning: () => makeReturning(options.projectSettingsRows ?? []),
          };
        }

        return {
          run: () => {},
          returning: () => makeReturning([]),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          if (table === execution_profiles) {
            return {
              run: () => options.onExecutionProfileUpdate?.(values),
            };
          }

          return {
            returning: () => makeReturning(options.projectSettingsRows ?? []),
          };
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
      ...makeSelectMock(new Map([[project_settings, []]])),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Settings not found");
  });

  it("設定が存在する場合に 200 で設定を返す", async () => {
    const db = {
      ...makeSelectMock(new Map([[project_settings, [sampleSettings]]])),
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

    // トランザクション内の tx モック
    const tx = makeInsertTxMock({
      projectSettingsRows: [created],
    });

    const db = {
      ...makeSelectMock(new Map([[project_settings, []]])),
      transaction: makeTransactionMock(tx),
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

    // トランザクション内の tx モック
    const tx = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            all: () =>
              table === execution_profiles
                ? [
                    {
                      id: 77,
                      name: "project-1-default",
                    },
                  ]
                : [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          run: () => {},
        }),
      }),
      update: (table: unknown) => ({
        set: (data: Record<string, unknown>) => ({
          where: () => {
            if (table === execution_profiles) {
              return {
                run: () => {},
              };
            }

            return {
              returning: () => makeReturning(table === project_settings ? [updated] : []),
            };
          },
        }),
      }),
    };

    const db = {
      ...makeSelectMock(new Map([[project_settings, [sampleSettings]]])),
      transaction: makeTransactionMock(tx),
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

    const tx = makeInsertTxMock({
      projectSettingsRows: [created],
      onProjectSettingsValues: (values) => {
        capturedValues = values;
      },
    });

    const db = {
      ...makeSelectMock(new Map([[project_settings, []]])),
      transaction: makeTransactionMock(tx),
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

    const tx = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            all: () =>
              table === execution_profiles
                ? [
                    {
                      id: 88,
                      name: "project-1-default",
                    },
                  ]
                : [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          run: () => {},
        }),
      }),
      update: (table: unknown) => ({
        set: (data: Record<string, unknown>) => ({
          where: () => {
            if (table === execution_profiles) {
              return {
                run: () => {},
              };
            }

            return {
              returning: () => {
                if (table === project_settings) {
                  capturedUpdateData = data;
                  return makeReturning([updated]);
                }
                return makeReturning([]);
              },
            };
          },
        }),
      }),
    };

    const db = {
      ...makeSelectMock(new Map([[project_settings, [sampleSettings]]])),
      transaction: makeTransactionMock(tx),
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

    const tx = makeInsertTxMock({
      projectSettingsRows: [created],
    });

    const db = {
      ...makeSelectMock(new Map([[project_settings, []]])),
      transaction: makeTransactionMock(tx),
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

    const tx = makeInsertTxMock({
      projectSettingsRows: [created],
    });

    const db = {
      ...makeSelectMock(new Map([[project_settings, []]])),
      transaction: makeTransactionMock(tx),
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

// ---- 新旧整合テスト ----

describe("PUT /api/projects/:projectId/settings - execution_profiles 同期", () => {
  it("settings 新規作成時に execution_profiles へ insert が実行される", async () => {
    const created: MockSettings = {
      id: 1,
      project_id: 1,
      model: "claude-opus-4-5",
      temperature: 0.7,
      api_provider: "anthropic",
      created_at: 5000000,
      updated_at: 5000000,
    };

    let executionProfileInsertCalled = false;
    let executionProfileInsertValues: Record<string, unknown> = {};

    const tx = makeInsertTxMock({
      projectSettingsRows: [created],
      onExecutionProfileInsert: (values) => {
        executionProfileInsertCalled = true;
        executionProfileInsertValues = values;
      },
    });

    const db = {
      ...makeSelectMock(new Map([[project_settings, []]])),
      transaction: makeTransactionMock(tx),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(201);
    expect(executionProfileInsertCalled).toBe(true);
    expect(executionProfileInsertValues.name).toBe("project-1-default");
    expect(executionProfileInsertValues.model).toBe("claude-opus-4-5");
    expect(executionProfileInsertValues.temperature).toBe(0.7);
    expect(executionProfileInsertValues.api_provider).toBe("anthropic");
  });

  it("settings 更新時に既存 execution_profiles を更新する", async () => {
    const updatedSettings: MockSettings = {
      ...sampleSettings,
      model: "claude-haiku-4-5",
      updated_at: 6000000,
    };

    let executionProfileUpdateCalled = false;
    let executionProfileUpdateValues: Record<string, unknown> = {};

    const tx = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            all: () =>
              table === execution_profiles
                ? [
                    {
                      id: 55,
                      name: "project-1-default",
                    },
                  ]
                : [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          run: () => {},
        }),
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            if (table === execution_profiles) {
              return {
                run: () => {
                  executionProfileUpdateCalled = true;
                  executionProfileUpdateValues = values;
                },
              };
            }

            return {
              returning: () => makeReturning(table === project_settings ? [updatedSettings] : []),
            };
          },
        }),
      }),
    };

    const db = {
      ...makeSelectMock(new Map([[project_settings, [sampleSettings]]])),
      transaction: makeTransactionMock(tx),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(200);
    expect(executionProfileUpdateCalled).toBe(true);
    expect(executionProfileUpdateValues.model).toBe("claude-haiku-4-5");
  });

  it("project-{projectId}-default という名前で execution_profile を識別する", async () => {
    const created: MockSettings = {
      id: 1,
      project_id: 42,
      model: "gpt-4o",
      temperature: 0.5,
      api_provider: "openai",
      created_at: 7000000,
      updated_at: 7000000,
    };

    let capturedProfileName = "";

    const tx = makeInsertTxMock({
      projectSettingsRows: [created],
      onExecutionProfileInsert: (values) => {
        capturedProfileName = values.name as string;
      },
    });

    const db = {
      ...makeSelectMock(new Map([[project_settings, []]])),
      transaction: makeTransactionMock(tx),
    };

    const app = buildApp(db);
    await app.request("/api/projects/42/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.5,
        api_provider: "openai",
      }),
    });

    expect(capturedProfileName).toBe("project-42-default");
  });

  it("settings 新規作成時に project_settings へ project_id を含めて保存する", async () => {
    const created: MockSettings = {
      id: 1,
      project_id: 7,
      model: "gpt-4o",
      temperature: 0.4,
      api_provider: "openai",
      created_at: 7100000,
      updated_at: 7100000,
    };

    let capturedValues: Record<string, unknown> = {};

    const tx = makeInsertTxMock({
      projectSettingsRows: [created],
      onProjectSettingsValues: (values) => {
        capturedValues = values;
      },
    });

    const db = {
      ...makeSelectMock(new Map([[project_settings, []]])),
      transaction: makeTransactionMock(tx),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/7/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.4,
        api_provider: "openai",
      }),
    });

    expect(res.status).toBe(201);
    expect(capturedValues).toMatchObject({
      project_id: 7,
      model: "gpt-4o",
      temperature: 0.4,
      api_provider: "openai",
    });
  });
});

// ---- POST /api/projects/:projectId/settings/models テスト ----

describe("POST /api/projects/:projectId/settings/models", () => {
  it("Anthropic APIキーで取得したモデル候補を返す", async () => {
    const listModels = vi.fn().mockResolvedValue([
      {
        id: "claude-sonnet-4-5-20250929",
        displayName: "Claude Sonnet 4.5",
        createdAt: "2025-09-29T00:00:00Z",
        raw: { id: "claude-sonnet-4-5-20250929" },
      },
    ]);
    const modelClientFactory = vi.fn().mockReturnValue({ listModels });

    const app = buildApp({}, { modelClientFactory });
    const res = await app.request("/api/projects/1/settings/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_provider: "anthropic",
        api_key: "sk-ant-test",
      }),
    });

    expect(res.status).toBe(200);
    expect(modelClientFactory).toHaveBeenCalledWith({
      api_provider: "anthropic",
      api_key: "sk-ant-test",
    });
    expect(listModels).toHaveBeenCalledWith();
    await expect(res.json()).resolves.toEqual({
      models: [
        {
          id: "claude-sonnet-4-5-20250929",
          displayName: "Claude Sonnet 4.5",
          createdAt: "2025-09-29T00:00:00Z",
          raw: { id: "claude-sonnet-4-5-20250929" },
        },
      ],
    });
  });

  it("APIキーが空の場合は 400 を返し、モデル取得を呼び出さない", async () => {
    const modelClientFactory = vi.fn();

    const app = buildApp({}, { modelClientFactory });
    const res = await app.request("/api/projects/1/settings/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_provider: "anthropic",
        api_key: "",
      }),
    });

    expect(res.status).toBe(400);
    expect(modelClientFactory).not.toHaveBeenCalled();
  });

  it("未対応プロバイダーの場合は 501 を返す", async () => {
    const app = buildApp({}, { modelClientFactory: () => null });
    const res = await app.request("/api/projects/1/settings/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_provider: "openai",
        api_key: "sk-test",
      }),
    });

    expect(res.status).toBe(501);
    await expect(res.json()).resolves.toEqual({
      error: "Provider model listing is not implemented",
    });
  });

  it("認証エラーの場合は 401 を返す", async () => {
    const app = buildApp(
      {},
      {
        modelClientFactory: () => ({
          listModels: vi.fn().mockRejectedValue(new LLMAuthenticationError("invalid api key")),
        }),
      },
    );

    const res = await app.request("/api/projects/1/settings/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_provider: "anthropic",
        api_key: "invalid",
      }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid api key" });
  });
});
