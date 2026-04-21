/**
 * Run CRUD + ベスト回答フラグ エンドポイントのテスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * 実際のDB接続は行わず、Drizzle の DB インターフェースを模倣した
 * モックを使用してルートハンドラの動作を検証する。
 *
 * project フィルタは prompt_version_projects 基準で実装されている。
 * execution_profile_id を指定して実行設定を snapshot として保存する。
 */

// better-sqlite3 のネイティブモジュールをモックしてDB初期化をブロック
vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB, LLMRequest } from "@prompt-reviewer/core";
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
  execution_trace: string | null;
  structured_output: string | null;
  is_best: boolean;
  is_discarded: boolean;
  created_at: number;
  model: string;
  temperature: number;
  api_provider: string;
  execution_profile_id: number | null;
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
  execution_trace: null,
  structured_output: null,
  is_best: false,
  is_discarded: false,
  created_at: 1000000,
  model: "claude-sonnet-4-6",
  temperature: 0.7,
  api_provider: "anthropic",
  execution_profile_id: null,
};

const sampleProfile = {
  id: 1,
  name: "Test Profile",
  description: null,
  model: "claude-sonnet-4-6",
  temperature: 0.4,
  api_provider: "anthropic" as const,
  created_at: 1000000,
  updated_at: 1000000,
};

const sampleStructuredOutput = {
  items: [
    {
      label: "insight",
      start_line: 1,
      end_line: 2,
      quote: "今日は晴れです。",
      rationale: "主要な内容を表しているため",
    },
  ],
};

// ---- テスト ----

describe("GET /api/projects/:projectId/runs", () => {
  it("prompt_version_projects 基準でフィルタしてRun一覧を200で返す", async () => {
    const runs = [sampleRun, { ...sampleRun, id: 2 }];

    // selectが2回呼ばれる: 1回目はprompt_version_projects、2回目はruns
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // prompt_version_projects の結果
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        // runs の結果
        return {
          from: () => ({
            where: () => Promise.resolve(runs),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<MockRun & { conversation: MockConversationMessage[] }>;
    expect(body).toHaveLength(2);
  });

  it("プロジェクトにバージョンが紐づいていない場合は空配列を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]), // prompt_version_projects が空
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
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([sampleRun]),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<MockRun & { conversation: MockConversationMessage[] }>;
    expect(body.at(0)?.conversation).toEqual(sampleConversation);
  });

  it("共有ラベルの別プロジェクトRunは一覧に含めない", async () => {
    let selectCallCount = 0;
    const projectScopedRuns = [sampleRun];

    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: (condition: unknown) => {
              expect(condition).toBeDefined();
              return Promise.resolve(projectScopedRuns);
            },
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<MockRun & { conversation: MockConversationMessage[] }>;
    expect(body).toEqual([
      expect.objectContaining({
        id: sampleRun.id,
        project_id: 1,
      }),
    ]);
  });

  it("prompt_version_idでフィルタリングできる", async () => {
    const filteredRuns = [sampleRun];

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve(filteredRuns),
          }),
        };
      },
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

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve(filteredRuns),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs?test_case_id=1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<MockRun & { conversation: MockConversationMessage[] }>;
    expect(body).toHaveLength(1);
    expect(body.at(0)?.test_case_id).toBe(1);
  });

  it("数値以外のprompt_version_idに対して400を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs?prompt_version_id=abc");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid prompt_version_id");
  });

  it("数値以外のtest_case_idに対して400を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        };
      },
    };

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

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        // prompt_version_projects のリンク確認
        return {
          from: () => ({
            where: () => Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
          }),
        };
      },
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
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
        }),
      }),
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

  it("is_discardedがfalseで初期化される", async () => {
    const created = { ...sampleRun, is_discarded: false };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
        }),
      }),
      insert: () => ({
        values: (values: { is_discarded: boolean }) => ({
          returning: () => {
            expect(values.is_discarded).toBe(false);
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
    expect(body.is_discarded).toBe(false);
  });

  it("execution_profile_idをRun作成時に保存できる", async () => {
    const created = { ...sampleRun, execution_profile_id: 1 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
        }),
      }),
      insert: () => ({
        values: (values: { execution_profile_id: number | null }) => ({
          returning: () => {
            expect(values.execution_profile_id).toBe(1);
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
        execution_profile_id: 1,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockRun;
    expect(body.execution_profile_id).toBe(1);
  });

  it("structured_output を保存してレスポンスでは JSON として返す", async () => {
    const created = {
      ...sampleRun,
      structured_output: JSON.stringify(sampleStructuredOutput),
    };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
        }),
      }),
      insert: () => ({
        values: (values: { structured_output: string | null }) => ({
          returning: () => {
            expect(values.structured_output).toBe(JSON.stringify(sampleStructuredOutput));
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
        structured_output: sampleStructuredOutput,
        model: "claude-sonnet-4-6",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockRun & {
      structured_output: typeof sampleStructuredOutput;
    };
    expect(body.structured_output).toEqual(sampleStructuredOutput);
  });

  it("プロジェクトに紐づかないバージョンで404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]), // versionLinkなし
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 99,
        test_case_id: 1,
        conversation: sampleConversation,
        model: "claude-sonnet-4-6",
        temperature: 0.7,
        api_provider: "anthropic",
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Prompt version not found in this project");
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

describe("POST /api/projects/:projectId/runs/execute", () => {
  it("execution_profile_id が未指定でも project_settings にフォールバックして実行できる", async () => {
    const version = {
      id: 1,
      project_id: 1,
      content: "あなたは親切なアシスタントです。",
      workflow_definition: null,
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify([{ role: "user", content: "要約してください" }]),
      context_content: "",
      title: "テストケース1",
      expected_description: null,
      display_order: 0,
      created_at: 0,
      updated_at: 0,
    };
    const projectSettings = {
      id: 1,
      project_id: 1,
      model: "claude-opus-4-5",
      temperature: 0.7,
      api_provider: "anthropic" as const,
      created_at: 0,
      updated_at: 0,
    };
    const created = {
      ...sampleRun,
      conversation: JSON.stringify([
        { role: "user", content: "要約してください" },
        { role: "assistant", content: "要約結果です" },
      ]),
      model: projectSettings.model,
      temperature: projectSettings.temperature,
      api_provider: projectSettings.api_provider,
      execution_profile_id: null,
    };

    let selectCallCount = 0;
    const capturedRequests: LLMRequest[] = [];
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // prompt_version_projects リンク確認
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          // test_case_projects リンク確認
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        return { from: () => ({ where: () => Promise.resolve([projectSettings]) }) };
      },
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = new Hono();
    app.route(
      "/api/projects/:projectId/runs",
      createRunsRouter(db as unknown as DB, {
        llmClientFactory: () => ({
          async sendMessage() {
            throw new Error("sendMessage should not be used for streaming execute");
          },
          async *stream(request: LLMRequest) {
            capturedRequests.push(request);
            yield {
              type: "response" as const,
              response: {
                content: "要約結果です",
                stopReason: "end_turn",
                raw: {},
              },
            };
          },
        }),
      }),
    );
    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
        // execution_profile_id なし
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]).toMatchObject({
      model: projectSettings.model,
      temperature: projectSettings.temperature,
    });
  });

  it("execution_profile_id も project_settings も無いとき404を返す", async () => {
    const version = {
      id: 1,
      project_id: 1,
      content: "あなたは親切なアシスタントです。",
      workflow_definition: null,
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify([{ role: "user", content: "要約してください" }]),
      context_content: "",
    };

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        return { from: () => ({ where: () => Promise.resolve([]) }) };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project settings not found");
  });

  it("execution_profile からスナップショットを保存してLLM応答をSSEで返す", async () => {
    const version = {
      id: 1,
      project_id: 1,
      content: "あなたは親切なアシスタントです。\n\n{{context}}",
      workflow_definition: null,
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify([{ role: "user", content: "要約してください" }]),
      context_content: "入力文: 今日は晴れです。",
      title: "テストケース1",
      expected_description: null,
      display_order: 0,
      created_at: 0,
      updated_at: 0,
    };
    const created = {
      ...sampleRun,
      conversation: JSON.stringify([
        { role: "user", content: "要約してください" },
        { role: "assistant", content: "今日は晴れです。" },
      ]),
      model: sampleProfile.model,
      temperature: sampleProfile.temperature,
      api_provider: sampleProfile.api_provider,
      execution_profile_id: sampleProfile.id,
    };

    const capturedRequests: LLMRequest[] = [];
    const capturedInsertValues: Array<{
      conversation: string;
      model: string;
      temperature: number;
      api_provider: string;
      execution_profile_id: number | null;
    }> = [];
    let selectCallCount = 0;

    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // prompt_version_projects リンク確認
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          // test_case_projects リンク確認
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        // execution_profile
        return { from: () => ({ where: () => Promise.resolve([sampleProfile]) }) };
      },
      insert: () => ({
        values: (values: {
          conversation: string;
          model: string;
          temperature: number;
          api_provider: string;
          execution_profile_id: number | null;
        }) => {
          capturedInsertValues.push(values);
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const app = new Hono();
    app.route(
      "/api/projects/:projectId/runs",
      createRunsRouter(db as unknown as DB, {
        llmClientFactory: () => ({
          async sendMessage() {
            throw new Error("sendMessage should not be used for streaming execute");
          },
          async *stream(request: LLMRequest) {
            capturedRequests.push(request);
            yield { type: "text-delta" as const, text: "今日は" };
            yield { type: "text-delta" as const, text: "晴れです。" };
            yield {
              type: "response" as const,
              response: {
                content: "今日は晴れです。",
                stopReason: "end_turn",
                raw: {},
              },
            };
          },
        }),
      }),
    );

    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
        execution_profile_id: 1,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const streamText = await res.text();
    expect(streamText).toContain('event: delta\ndata: {"text":"今日は"}');
    expect(streamText).toContain('event: delta\ndata: {"text":"晴れです。"}');
    expect(streamText).toContain("event: run");

    // execution_profile からのスナップショットが保存される
    expect(capturedInsertValues[0]?.model).toBe(sampleProfile.model);
    expect(capturedInsertValues[0]?.temperature).toBe(sampleProfile.temperature);
    expect(capturedInsertValues[0]?.api_provider).toBe(sampleProfile.api_provider);
    expect(capturedInsertValues[0]?.execution_profile_id).toBe(sampleProfile.id);

    // LLMリクエストも execution_profile の設定で実行される
    expect(capturedRequests[0]).toMatchObject({
      model: sampleProfile.model,
      temperature: sampleProfile.temperature,
      systemPrompt: "あなたは親切なアシスタントです。\n\n1: 入力文: 今日は晴れです。",
    });
  });

  it("runs/execute でも structured_output を保存して run イベントで返す", async () => {
    const version = {
      id: 1,
      project_id: 1,
      content: "あなたは親切なアシスタントです。",
      workflow_definition: null,
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify([{ role: "user", content: "要約してください" }]),
      context_content: "",
      title: "テストケース",
      expected_description: null,
      display_order: 0,
      created_at: 0,
      updated_at: 0,
    };
    const created = {
      ...sampleRun,
      conversation: JSON.stringify([
        { role: "user", content: "要約してください" },
        { role: "assistant", content: "今日は晴れです。" },
      ]),
      structured_output: JSON.stringify(sampleStructuredOutput),
      model: sampleProfile.model,
      temperature: sampleProfile.temperature,
      api_provider: sampleProfile.api_provider,
      execution_profile_id: sampleProfile.id,
    };

    const capturedInsertValues: Array<{ structured_output: string | null }> = [];
    let selectCallCount = 0;

    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        return { from: () => ({ where: () => Promise.resolve([sampleProfile]) }) };
      },
      insert: () => ({
        values: (values: { structured_output: string | null }) => {
          capturedInsertValues.push(values);
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const app = new Hono();
    app.route(
      "/api/projects/:projectId/runs",
      createRunsRouter(db as unknown as DB, {
        llmClientFactory: () => ({
          async sendMessage() {
            throw new Error("sendMessage should not be used for streaming execute");
          },
          async *stream() {
            yield { type: "text-delta" as const, text: "今日は晴れです。" };
            yield {
              type: "response" as const,
              response: {
                content: "今日は晴れです。",
                stopReason: "end_turn",
                raw: {},
              },
            };
          },
        }),
      }),
    );

    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
        execution_profile_id: 1,
        structured_output: sampleStructuredOutput,
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedInsertValues[0]?.structured_output).toBe(JSON.stringify(sampleStructuredOutput));

    const streamText = await res.text();
    expect(streamText).toContain(`"structured_output":${JSON.stringify(sampleStructuredOutput)}`);
  });

  it("text-delta より完全な最終 response があるときは response.content を保存する", async () => {
    const version = {
      id: 1,
      project_id: 1,
      content: "あなたは親切なアシスタントです。",
      workflow_definition: null,
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify([{ role: "user", content: "詳しく説明してください" }]),
      context_content: "",
      title: "テストケース",
      expected_description: null,
      display_order: 0,
      created_at: 0,
      updated_at: 0,
    };
    const fullResponse = "冒頭だけでなく、最後まで含んだ完全な応答です。";
    const created = {
      ...sampleRun,
      conversation: JSON.stringify([
        { role: "user", content: "詳しく説明してください" },
        { role: "assistant", content: fullResponse },
      ]),
      model: sampleProfile.model,
      temperature: sampleProfile.temperature,
      api_provider: sampleProfile.api_provider,
    };

    const capturedInsertValues: Array<{ conversation: string }> = [];
    let selectCallCount = 0;

    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        return { from: () => ({ where: () => Promise.resolve([sampleProfile]) }) };
      },
      insert: () => ({
        values: (values: { conversation: string }) => {
          capturedInsertValues.push(values);
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const app = new Hono();
    app.route(
      "/api/projects/:projectId/runs",
      createRunsRouter(db as unknown as DB, {
        llmClientFactory: () => ({
          async sendMessage() {
            throw new Error("sendMessage should not be used for streaming execute");
          },
          async *stream() {
            yield { type: "text-delta" as const, text: "冒頭だけ" };
            yield {
              type: "response" as const,
              response: {
                content: fullResponse,
                stopReason: "end_turn",
                raw: {},
              },
            };
          },
        }),
      }),
    );

    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
        execution_profile_id: 1,
      }),
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(capturedInsertValues[0]?.conversation ?? "[]")).toEqual([
      { role: "user", content: "詳しく説明してください" },
      { role: "assistant", content: fullResponse },
    ]);
  });

  it("turnsが空のときプロンプトをuser messageとして送信してRunを保存する", async () => {
    const version = {
      id: 1,
      project_id: 1,
      content: "次のルールで回答してください。\n\n{{context}}",
      workflow_definition: null,
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify([]),
      context_content: "入力文: 今日は晴れです。",
      title: "テストケース",
      expected_description: null,
      display_order: 0,
      created_at: 0,
      updated_at: 0,
    };
    const promptMessage = "次のルールで回答してください。\n\n1: 入力文: 今日は晴れです。";
    const created = {
      ...sampleRun,
      conversation: JSON.stringify([
        { role: "user", content: promptMessage },
        { role: "assistant", content: "今日は晴れです。" },
      ]),
      model: sampleProfile.model,
      temperature: sampleProfile.temperature,
      api_provider: sampleProfile.api_provider,
    };

    const capturedRequests: LLMRequest[] = [];
    const capturedInsertValues: Array<{ conversation: string }> = [];
    let selectCallCount = 0;

    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        return { from: () => ({ where: () => Promise.resolve([sampleProfile]) }) };
      },
      insert: () => ({
        values: (values: { conversation: string }) => {
          capturedInsertValues.push(values);
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const app = new Hono();
    app.route(
      "/api/projects/:projectId/runs",
      createRunsRouter(db as unknown as DB, {
        llmClientFactory: () => ({
          async sendMessage() {
            throw new Error("sendMessage should not be used for streaming execute");
          },
          async *stream(request: LLMRequest) {
            capturedRequests.push(request);
            yield { type: "text-delta" as const, text: "今日は晴れです。" };
            yield {
              type: "response" as const,
              response: {
                content: "今日は晴れです。",
                stopReason: "end_turn",
                raw: {},
              },
            };
          },
        }),
      }),
    );

    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
        execution_profile_id: 1,
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedRequests).toEqual([
      {
        model: sampleProfile.model,
        messages: [{ role: "user", content: promptMessage }],
        temperature: sampleProfile.temperature,
      },
    ]);
    expect(JSON.parse(capturedInsertValues[0]?.conversation ?? "[]")).toEqual([
      { role: "user", content: promptMessage },
      { role: "assistant", content: "今日は晴れです。" },
    ]);
  });

  it("turnsもプロンプトも空のとき400を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  { id: 1, project_id: 1, content: "   ", workflow_definition: null },
                ]),
            }),
          };
        }
        if (selectCallCount === 4) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  {
                    id: 1,
                    project_id: 1,
                    turns: JSON.stringify([]),
                    context_content: "",
                    title: "test",
                    expected_description: null,
                    display_order: 0,
                    created_at: 0,
                    updated_at: 0,
                  },
                ]),
            }),
          };
        }
        // execution_profile
        return { from: () => ({ where: () => Promise.resolve([sampleProfile]) }) };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
        execution_profile_id: 1,
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Prompt or test case turns are required");
  });

  it("execution_profile が存在しないとき404を返す", async () => {
    const version = {
      id: 1,
      project_id: 1,
      content: "system",
      workflow_definition: null,
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify(sampleConversation),
      context_content: "",
      title: "test",
      expected_description: null,
      display_order: 0,
      created_at: 0,
      updated_at: 0,
    };

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        // execution_profile が存在しない
        return { from: () => ({ where: () => Promise.resolve([]) }) };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
        execution_profile_id: 999,
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Execution profile not found");
  });

  it("未対応プロバイダーのとき501を返す", async () => {
    const openAiProfile = {
      ...sampleProfile,
      model: "gpt-4o",
      api_provider: "openai" as const,
    };
    const version = {
      id: 1,
      project_id: 1,
      content: "system",
      workflow_definition: null,
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify(sampleConversation),
      context_content: "",
      title: "test",
      expected_description: null,
      display_order: 0,
      created_at: 0,
      updated_at: 0,
    };

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        return { from: () => ({ where: () => Promise.resolve([openAiProfile]) }) };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-test",
        execution_profile_id: 1,
      }),
    });

    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Provider execution is not implemented");
  });

  it("プロジェクトに紐づかないバージョンは404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]), // versionLink が存在しない
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 99,
        test_case_id: 1,
        api_key: "sk-ant-test",
        execution_profile_id: 1,
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Prompt version not found");
  });

  it("workflow_definition があるときプロンプト本文をStep 1として追加ステップを順番に実行して保存する", async () => {
    const version = {
      id: 1,
      project_id: 1,
      content: "判定してください\n\n{{context}}",
      workflow_definition: JSON.stringify({
        steps: [
          {
            id: "extract_effective",
            title: "効果発言抽出",
            prompt: "文脈: {{context}}\n前段: {{step:__base_prompt__}}\n前回: {{previous_output}}",
          },
        ],
      }),
    };
    const testCase = {
      id: 1,
      project_id: 1,
      turns: JSON.stringify([{ role: "user", content: "長い相談ログ" }]),
      context_content: "元の相談コンテキスト",
      title: "テストケース",
      expected_description: null,
      display_order: 0,
      created_at: 0,
      updated_at: 0,
    };
    const created = {
      ...sampleRun,
      conversation: JSON.stringify([
        { role: "user", content: "長い相談ログ" },
        { role: "assistant", content: "効果があった発言は A と B です。" },
      ]),
      execution_trace: JSON.stringify([]),
      model: sampleProfile.model,
      temperature: sampleProfile.temperature,
      api_provider: sampleProfile.api_provider,
      execution_profile_id: sampleProfile.id,
    };

    let selectCallCount = 0;
    const capturedRequests: LLMRequest[] = [];
    const capturedInsertValues: Array<{ execution_trace: string | null }> = [];
    let streamCallCount = 0;

    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([{ prompt_version_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1, project_id: 1, created_at: 0 }]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return { from: () => ({ where: () => Promise.resolve([version]) }) };
        }
        if (selectCallCount === 4) {
          return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
        }
        return { from: () => ({ where: () => Promise.resolve([sampleProfile]) }) };
      },
      insert: () => ({
        values: (values: { execution_trace: string | null }) => {
          capturedInsertValues.push(values);
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const app = new Hono();
    app.route(
      "/api/projects/:projectId/runs",
      createRunsRouter(db as unknown as DB, {
        llmClientFactory: () => ({
          async sendMessage() {
            throw new Error("sendMessage should not be used for streaming execute");
          },
          async *stream(request: LLMRequest) {
            capturedRequests.push(request);
            if (streamCallCount === 0) {
              streamCallCount++;
              yield { type: "text-delta" as const, text: "行動を促せている" };
              return;
            }

            yield { type: "text-delta" as const, text: "効果があった発言は A と B です。" };
          },
        }),
      }),
    );

    const res = await app.request("/api/projects/1/runs/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_version_id: 1,
        test_case_id: 1,
        api_key: "sk-ant-test",
        execution_profile_id: 1,
      }),
    });

    expect(res.status).toBe(200);
    const streamText = await res.text();
    expect(capturedRequests).toHaveLength(2);
    expect(JSON.parse(capturedInsertValues[0]?.execution_trace ?? "[]")).toHaveLength(2);
    expect(capturedRequests[0]).toMatchObject({
      systemPrompt: "判定してください\n\n1: 元の相談コンテキスト",
    });
    expect(capturedRequests[1]).toMatchObject({
      messages: [{ role: "user", content: "長い相談ログ" }],
      systemPrompt: "文脈: 行動を促せている\n前段: 行動を促せている\n前回: 行動を促せている",
    });
    expect(streamText).toContain("event: step-start");
    expect(streamText).toContain("event: step-complete");
  });
});

describe("GET /api/projects/:projectId/runs/:id", () => {
  it("存在するIDに対して200でRunを返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // prompt_version_projects
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([sampleRun]),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockRun & { conversation: MockConversationMessage[] };
    expect(body.id).toBe(1);
    expect(body.conversation).toEqual(sampleConversation);
  });

  it("存在しないIDに対して404を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/999");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Run not found");
  });

  it("プロジェクトにバージョンが存在しない場合404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]), // prompt_version_projects が空
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1");

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

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([sampleRun]),
          }),
        };
      },
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

  it("ベスト解除・設定は同一プロジェクトのRunだけを更新する", async () => {
    const updated = { ...sampleRun, is_best: true };
    const whereArgs: unknown[] = [];

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([sampleRun]),
          }),
        };
      },
      update: () => ({
        set: () => ({
          where: (condition: unknown) => {
            whereArgs.push(condition);
            return {
              returning: () => Promise.resolve([updated]),
            };
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/best", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(whereArgs).toHaveLength(2);
  });

  it("同一バージョン×テストケースの既存フラグが解除される", async () => {
    const updated = { ...sampleRun, is_best: true };

    let updateCallCount = 0;
    const capturedSets: Array<{ is_best: boolean }> = [];

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([sampleRun]),
          }),
        };
      },
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
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        };
      },
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

describe("PATCH /api/projects/:projectId/runs/:id/discard", () => {
  it("存在するIDに対して200でis_discarded=trueのRunを返す", async () => {
    const updated = { ...sampleRun, is_discarded: true };

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([sampleRun]),
          }),
        };
      },
      update: () => ({
        set: (values: { is_discarded: boolean }) => ({
          where: () => ({
            returning: () => {
              expect(values.is_discarded).toBe(true);
              return Promise.resolve([updated]);
            },
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/discard", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockRun & { conversation: MockConversationMessage[] };
    expect(body.is_discarded).toBe(true);
  });

  it("破棄更新は同一プロジェクトのRunだけを対象にする", async () => {
    const updated = { ...sampleRun, is_discarded: true };
    const whereArgs: unknown[] = [];

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([sampleRun]),
          }),
        };
      },
      update: () => ({
        set: () => ({
          where: (condition: unknown) => {
            whereArgs.push(condition);
            return {
              returning: () => Promise.resolve([updated]),
            };
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/discard", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(whereArgs).toHaveLength(1);
  });

  it("存在しないIDに対して404を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/999/discard", {
      method: "PATCH",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Run not found");
  });
});

// ---- candidates/extract テスト用データ ----

const sampleAnnotationTask = {
  id: 1,
  name: "テストアノテーションタスク",
  description: null,
  output_mode: "span_label" as const,
  created_at: 1000000,
  updated_at: 1000000,
};

const sampleAnnotationLabels = [{ key: "insight" }, { key: "question" }];

const sampleRunWithStructuredOutput: MockRun = {
  ...sampleRun,
  structured_output: JSON.stringify({
    items: [
      {
        label: "insight",
        start_line: 1,
        end_line: 3,
        quote: "今日は晴れです。",
        rationale: "天気についての洞察",
      },
    ],
  }),
};

const sampleRunWithFinalAnswer: MockRun = {
  ...sampleRun,
  structured_output: null,
  conversation: JSON.stringify([
    { role: "user", content: "文章を分析してください" },
    {
      role: "assistant",
      content: JSON.stringify({
        items: [
          {
            label: "question",
            start_line: 2,
            end_line: 4,
            quote: "何か問題がありますか？",
          },
        ],
      }),
    },
  ]),
};

const sampleRunWithTraceStep: MockRun = {
  ...sampleRun,
  execution_trace: JSON.stringify([
    {
      id: "step-1",
      title: "抽出ステップ",
      prompt: "候補を抽出する",
      renderedPrompt: "候補を抽出する",
      inputConversation: sampleConversation,
      output: JSON.stringify({
        items: [
          {
            label: "insight",
            start_line: 3,
            end_line: 5,
            quote: "途中ステップからの候補",
            rationale: "trace_step由来",
          },
        ],
      }),
    },
  ]),
};

/**
 * candidates/extract エンドポイント用のDBモック構築ヘルパー
 *
 * selectCallCount に対応するレスポンスを配列で指定する:
 * 1. prompt_version_projects (versionIds)
 * 2. runs (run取得)
 * 3. annotation_tasks (task確認)
 * 4. annotation_labels (labelキー一覧)
 * 5. annotation_candidates (重複チェック)
 */
function buildExtractDb(params: {
  run?: MockRun | null;
  task?: typeof sampleAnnotationTask | null;
  labels?: Array<{ key: string }>;
  existingCandidate?: { id: number } | null;
  insertReturns?: unknown[];
  insertedValues?: Record<string, unknown>[] | null;
}) {
  const {
    run = sampleRunWithStructuredOutput,
    task = sampleAnnotationTask,
    labels = sampleAnnotationLabels,
    existingCandidate = null,
    insertReturns = [],
    insertedValues = null,
  } = params;

  let selectCallCount = 0;

  return {
    select: () => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // prompt_version_projects
        return {
          from: () => ({
            where: () => Promise.resolve(run !== null ? [{ prompt_version_id: 1 }] : []),
          }),
        };
      }
      if (selectCallCount === 2) {
        // runs
        return {
          from: () => ({
            where: () => Promise.resolve(run !== null ? [run] : []),
          }),
        };
      }
      if (selectCallCount === 3) {
        // annotation_tasks
        return {
          from: () => ({
            where: () => Promise.resolve(task !== null ? [task] : []),
          }),
        };
      }
      if (selectCallCount === 4) {
        // annotation_labels
        return {
          from: () => ({
            where: () => Promise.resolve(labels),
          }),
        };
      }
      // annotation_candidates 重複チェック
      return {
        from: () => ({
          where: () => Promise.resolve(existingCandidate !== null ? [existingCandidate] : []),
        }),
      };
    },
    insert: () => ({
      values: (values: Record<string, unknown>[]) => {
        if (insertedValues) {
          insertedValues.push(...values);
        }
        return {
          returning: () => Promise.resolve(insertReturns),
        };
      },
    }),
  };
}

describe("POST /api/projects/:projectId/runs/:id/candidates/extract", () => {
  it("structured_output から Candidate を生成して 201 を返す", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    const db = buildExtractDb({ insertReturns: [{ id: 1 }], insertedValues });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1 }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      candidates_created: number;
      run_id: number;
      annotation_task_id: number;
    };
    expect(body).toEqual({
      candidates_created: 1,
      run_id: 1,
      annotation_task_id: 1,
    });
    expect(insertedValues).toEqual([
      expect.objectContaining({
        source_type: "structured_json",
        label: "insight",
        target_text_ref: "test_case:1",
        status: "pending",
      }),
    ]);
  });

  it("source_type を省略した場合は final_answer にフォールバックして 201 を返す", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    const db = buildExtractDb({
      run: sampleRunWithFinalAnswer,
      insertReturns: [{ id: 2 }],
      insertedValues,
    });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1 }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      candidates_created: number;
      run_id: number;
      annotation_task_id: number;
    };
    expect(body).toEqual({
      candidates_created: 1,
      run_id: 1,
      annotation_task_id: 1,
    });
    expect(insertedValues).toEqual([
      expect.objectContaining({
        source_type: "final_answer",
        label: "question",
      }),
    ]);
  });

  it("source_type=final_answer を明示すると structured_output があっても final_answer を使う", async () => {
    const runWithBothSources: MockRun = {
      ...sampleRunWithStructuredOutput,
      conversation: sampleRunWithFinalAnswer.conversation,
    };
    const insertedValues: Record<string, unknown>[] = [];
    const db = buildExtractDb({
      run: runWithBothSources,
      insertReturns: [{ id: 3 }],
      insertedValues,
    });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1, source_type: "final_answer" }),
    });

    expect(res.status).toBe(201);
    expect(insertedValues).toEqual([
      expect.objectContaining({
        source_type: "final_answer",
        label: "question",
      }),
    ]);
  });

  it("final_answer のパースに失敗しても structured_output があればそちらへフォールバックする", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    const runWithInvalidFinalAnswerAndStructuredOutput: MockRun = {
      ...sampleRunWithStructuredOutput,
      conversation: JSON.stringify([
        { role: "user", content: "文章を分析してください" },
        {
          role: "assistant",
          content: "```json\nnot-json\n```",
        },
      ]),
    };

    const db = buildExtractDb({
      run: runWithInvalidFinalAnswerAndStructuredOutput,
      insertReturns: [{ id: 6 }],
      insertedValues,
    });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1, source_type: "final_answer" }),
    });

    expect(res.status).toBe(201);
    expect(insertedValues).toEqual([
      expect.objectContaining({
        source_type: "structured_json",
        label: "insight",
      }),
    ]);
  });

  it("source_type=trace_step と source_step_id を指定すると対象 step から抽出する", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    const db = buildExtractDb({
      run: sampleRunWithTraceStep,
      insertReturns: [{ id: 4 }],
      insertedValues,
    });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        annotation_task_id: 1,
        source_type: "trace_step",
        source_step_id: "step-1",
      }),
    });

    expect(res.status).toBe(201);
    expect(insertedValues).toEqual([
      expect.objectContaining({
        source_type: "trace_step",
        source_step_id: "step-1",
        label: "insight",
      }),
    ]);
  });

  it("存在しない label を含む場合は 400 を返す", async () => {
    const runWithInvalidLabel: MockRun = {
      ...sampleRun,
      structured_output: JSON.stringify({
        items: [
          {
            label: "nonexistent_label",
            start_line: 1,
            end_line: 2,
            quote: "テスト",
          },
        ],
      }),
    };

    const db = buildExtractDb({ run: runWithInvalidLabel });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("nonexistent_label");
  });

  it("start_line > end_line の不正 line range で 400 を返す", async () => {
    const runWithInvalidRange: MockRun = {
      ...sampleRun,
      structured_output: JSON.stringify({
        items: [
          {
            label: "insight",
            start_line: 5,
            end_line: 2,
            quote: "テスト",
          },
        ],
      }),
    };

    const db = buildExtractDb({ run: runWithInvalidRange });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("start_line");
    expect(body.error).toContain("end_line");
  });

  it("final_answer で JSON パース失敗の場合は 400 を返す（items フィールドなし）", async () => {
    const runWithInvalidJson: MockRun = {
      ...sampleRun,
      structured_output: null,
      conversation: JSON.stringify([
        { role: "user", content: "分析してください" },
        {
          role: "assistant",
          content: JSON.stringify({ result: "no_items_field" }),
        },
      ]),
    };

    const db = buildExtractDb({ run: runWithInvalidJson });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("invalid format");
  });

  it("final_answer の JSON 文字列内に生改行があっても Candidate を生成できる", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    const runWithMultilineQuote: MockRun = {
      ...sampleRun,
      structured_output: null,
      conversation: JSON.stringify([
        { role: "user", content: "文章を分析してください" },
        {
          role: "assistant",
          content: `\`\`\`json
{"items":[
  {"label":"insight","start_line":1568,"end_line":1571,"quote":"「どうすればうまくいくか」を常に慎重に考えている
- 行動の順番や準備の微調整、体調との兼ね合いなどを常に考えている
- これが無意識に脳のリソースを使い、疲労感や余裕のなさに繋がる","rationale":"aiが慎重な思考自体が認知負荷になる構造を指摘している"}
]}
\`\`\``,
        },
      ]),
    };

    const db = buildExtractDb({
      run: runWithMultilineQuote,
      insertReturns: [{ id: 5 }],
      insertedValues,
    });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1 }),
    });

    expect(res.status).toBe(201);
    expect(insertedValues).toEqual([
      expect.objectContaining({
        source_type: "final_answer",
        label: "insight",
        start_line: 1568,
        end_line: 1571,
        quote:
          "「どうすればうまくいくか」を常に慎重に考えている\n- 行動の順番や準備の微調整、体調との兼ね合いなどを常に考えている\n- これが無意識に脳のリソースを使い、疲労感や余裕のなさに繋がる",
      }),
    ]);
  });

  it("final_answer の JSON 文字列内に未エスケープの引用符があっても Candidate を生成できる", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    const runWithBareQuotes: MockRun = {
      ...sampleRun,
      structured_output: null,
      conversation: JSON.stringify([
        { role: "user", content: "文章を分析してください" },
        {
          role: "assistant",
          content: `\`\`\`json
{"items":[
  {"label":"insight","start_line":1897,"end_line":1897,"quote":"「無為には過ごしたくないけれど、興味も湧かず、何をすればいいか分からない」という状態は、回復期によくある"エネルギーはまだ低いけど、自己意識は戻りつつある"時期の特徴でもあります。","rationale":"aiが回復プロセスの特徴を指摘している"}
]}
\`\`\``,
        },
      ]),
    };

    const db = buildExtractDb({
      run: runWithBareQuotes,
      insertReturns: [{ id: 7 }],
      insertedValues,
    });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1, source_type: "final_answer" }),
    });

    expect(res.status).toBe(201);
    expect(insertedValues).toEqual([
      expect.objectContaining({
        source_type: "final_answer",
        label: "insight",
        start_line: 1897,
        end_line: 1897,
        quote:
          '「無為には過ごしたくないけれど、興味も湧かず、何をすればいいか分からない」という状態は、回復期によくある"エネルギーはまだ低いけど、自己意識は戻りつつある"時期の特徴でもあります。',
      }),
    ]);
  });

  it("重複抽出時に 409 を返す", async () => {
    const db = buildExtractDb({
      existingCandidate: { id: 99 },
    });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1 }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("already extracted");
  });

  it("source_type=trace_step で source_step_id がない場合は 400 を返す", async () => {
    const db = buildExtractDb({ run: sampleRunWithTraceStep });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1, source_type: "trace_step" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("source_step_id");
  });

  it("run が存在しない場合は 404 を返す", async () => {
    const db = buildExtractDb({ run: null });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/999/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 1 }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Run not found");
  });

  it("annotation_task が存在しない場合は 404 を返す", async () => {
    const db = buildExtractDb({ task: null });

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/runs/1/candidates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation_task_id: 999 }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Annotation task not found");
  });
});
