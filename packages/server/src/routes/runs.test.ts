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
  it("execution_profile_id が未指定のとき400を返す", async () => {
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
        return { from: () => ({ where: () => Promise.resolve([testCase]) }) };
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
        // execution_profile_id なし
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("execution_profile_id is required");
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
      systemPrompt: "あなたは親切なアシスタントです。\n\n入力文: 今日は晴れです。",
    });
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
    const promptMessage = "次のルールで回答してください。\n\n入力文: 今日は晴れです。";
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
      systemPrompt: "判定してください\n\n元の相談コンテキスト",
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
