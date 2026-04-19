/**
 * PromptVersion CRUD + 分岐エンドポイントのテスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * 実際のDB接続は行わず、Drizzle の DB インターフェースを模倣した
 * モックを使用してルートハンドラの動作を検証する。
 */

vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createPromptVersionsRouter } from "./prompt-versions.js";

// ---- 型定義 ----

type MockPromptVersion = {
  id: number;
  prompt_family_id: number;
  project_id: number | null;
  version: number;
  name: string | null;
  memo: string | null;
  content: string;
  workflow_definition: { steps: Array<{ id: string; title: string; prompt: string }> } | null;
  parent_version_id: number | null;
  created_at: number;
  is_selected: boolean;
};

// ---- ヘルパー ----

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/prompt-versions", createPromptVersionsRouter(db as DB));
  return app;
}

function buildLegacyApp(db: unknown) {
  const app = new Hono();
  app.route("/api/projects/:projectId/prompt-versions", createPromptVersionsRouter(db as DB));
  return app;
}

// ---- テストデータ ----

const sampleVersion: MockPromptVersion = {
  id: 1,
  prompt_family_id: 10,
  project_id: null,
  version: 1,
  name: "初期バージョン",
  memo: null,
  content: "あなたは親切なアシスタントです。",
  workflow_definition: null,
  parent_version_id: null,
  created_at: 1000000,
  is_selected: false,
};

// ---- GET /api/prompt-versions ----

describe("GET /api/prompt-versions", () => {
  it("prompt_family_id でフィルタしたバージョン一覧を200で返す", async () => {
    const versions = [sampleVersion, { ...sampleVersion, id: 2, version: 2, name: "v2" }];

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(versions),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions?prompt_family_id=10");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.version).toBe(1);
    expect(body.at(1)?.version).toBe(2);
  });

  it("prompt_family_id が未指定のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("prompt_family_id is required");
  });

  it("バージョンが0件のとき空配列を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions?prompt_family_id=10");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion[];
    expect(body).toHaveLength(0);
  });
});

// ---- GET /api/projects/:projectId/prompt-versions ----

describe("GET /api/projects/:projectId/prompt-versions", () => {
  it("project にリンクされた version 一覧を返し、project_id を補完する", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([{ prompt_version_id: 1 }]);
            }
            return Promise.resolve([sampleVersion]);
          },
        }),
      }),
    };

    const res = await buildLegacyApp(db).request("/api/projects/7/prompt-versions");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion[];
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(1);
    expect(body[0]?.project_id).toBe(7);
  });
});

// ---- POST /api/prompt-versions ----

describe("POST /api/prompt-versions", () => {
  it("バリデーション通過時に201でバージョンを返す", async () => {
    const created = { ...sampleVersion };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ maxVersion: 0 }]),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_family_id: 10,
        content: "あなたは親切なアシスタントです。",
        name: "初期バージョン",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.content).toBe("あなたは親切なアシスタントです。");
    expect(body.name).toBe("初期バージョン");
  });

  it("family内の version が max+1 で採番される", async () => {
    const created = { ...sampleVersion, id: 3, version: 3 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ maxVersion: 2 }]),
        }),
      }),
      insert: () => ({
        values: (values: { version: number; prompt_family_id: number }) => ({
          returning: () => {
            expect(values.version).toBe(3);
            expect(values.prompt_family_id).toBe(10);
            return Promise.resolve([created]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt_family_id: 10, content: "新しいプロンプト", name: "v3" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.version).toBe(3);
  });

  it("family内にバージョンが0件の場合、version=1 で採番される", async () => {
    const created = { ...sampleVersion, version: 1 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ maxVersion: null }]),
        }),
      }),
      insert: () => ({
        values: (values: { version: number }) => ({
          returning: () => {
            expect(values.version).toBe(1);
            return Promise.resolve([created]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt_family_id: 10, content: "初めてのプロンプト" }),
    });

    expect(res.status).toBe(201);
  });

  it("name が未指定のとき自動命名して保存する", async () => {
    const created = { ...sampleVersion, version: 2, name: "プロンプト 2" };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ maxVersion: 1 }]),
        }),
      }),
      insert: () => ({
        values: (values: { name: string; version: number }) => ({
          returning: () => {
            expect(values.version).toBe(2);
            expect(values.name).toBe("プロンプト 2");
            return Promise.resolve([created]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt_family_id: 10, content: "初めてのプロンプト" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.name).toBe("プロンプト 2");
  });

  it("prompt_family_id が未指定のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "プロンプト" }),
    });

    expect(res.status).toBe(400);
  });

  it("content が空文字列のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt_family_id: 10, content: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("workflow_definition の step.id に使用不可の文字があるとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_family_id: 10,
        content: "プロンプト本文",
        workflow_definition: {
          steps: [{ id: "step.1", title: "抽出", prompt: "内容を抽出してください" }],
        },
      }),
    });

    expect(res.status).toBe(400);
  });

  it("workflow_definition の step.id が重複すると400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_family_id: 10,
        content: "プロンプト本文",
        workflow_definition: {
          steps: [
            { id: "extract", title: "抽出1", prompt: "内容を抽出してください" },
            { id: "extract", title: "抽出2", prompt: "要約してください" },
          ],
        },
      }),
    });

    expect(res.status).toBe(400);
  });

  it("workflow_definition の step.id に予約済みIDを使うと400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_family_id: 10,
        content: "プロンプト本文",
        workflow_definition: {
          steps: [{ id: "__base_prompt__", title: "抽出", prompt: "内容を抽出してください" }],
        },
      }),
    });

    expect(res.status).toBe(400);
  });
});

// ---- POST /api/projects/:projectId/prompt-versions ----

describe("POST /api/projects/:projectId/prompt-versions", () => {
  it("legacy path で family 未作成なら新規 family を作って version を作成する", async () => {
    const created = { ...sampleVersion, prompt_family_id: 30, project_id: 7 };
    let selectCallCount = 0;
    let insertCallCount = 0;

    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([]);
            }
            return Promise.resolve([{ maxVersion: null }]);
          },
        }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertCallCount++;
          if (insertCallCount === 1) {
            expect(values.name).toBeNull();
            return {
              returning: () => Promise.resolve([{ id: 30 }]),
            };
          }
          if (insertCallCount === 2) {
            expect(values.prompt_family_id).toBe(30);
            expect(values.project_id).toBe(7);
            return {
              returning: () => Promise.resolve([created]),
            };
          }
          expect(values.prompt_version_id).toBe(1);
          expect(values.project_id).toBe(7);
          return Promise.resolve();
        },
      }),
    };

    const res = await buildLegacyApp(db).request("/api/projects/7/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "互換 API で作成" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.prompt_family_id).toBe(30);
    expect(body.project_id).toBe(7);
  });

  it("legacy path で複数 family にまたがる project は 409 を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([{ prompt_version_id: 1 }, { prompt_version_id: 2 }]);
            }
            if (selectCallCount === 2) {
              return Promise.resolve([sampleVersion]);
            }
            return Promise.resolve([{ ...sampleVersion, id: 2, prompt_family_id: 11 }]);
          },
        }),
      }),
    };

    const res = await buildLegacyApp(db).request("/api/projects/7/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "互換 API で作成" }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Legacy project is linked to multiple prompt families",
    });
  });
});

// ---- GET /api/prompt-versions/:id ----

describe("GET /api/prompt-versions/:id", () => {
  it("存在するIDに対して200でバージョンを返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleVersion]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.id).toBe(1);
    expect(body.content).toBe("あなたは親切なアシスタントです。");
    expect(body.prompt_family_id).toBe(10);
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
    const res = await app.request("/api/prompt-versions/999");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PromptVersion not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/abc");

    expect(res.status).toBe(400);
  });
});

// ---- GET /api/projects/:projectId/prompt-versions/:id ----

describe("GET /api/projects/:projectId/prompt-versions/:id", () => {
  it("legacy path で project にリンクされた version 詳細を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([{ prompt_version_id: 1 }]);
            }
            return Promise.resolve([sampleVersion]);
          },
        }),
      }),
    };

    const res = await buildLegacyApp(db).request("/api/projects/7/prompt-versions/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.id).toBe(1);
    expect(body.project_id).toBe(7);
  });
});

// ---- PATCH /api/prompt-versions/:id ----

describe("PATCH /api/prompt-versions/:id", () => {
  it("存在するIDに対して200で更新されたバージョンを返す", async () => {
    const updated = { ...sampleVersion, content: "更新されたプロンプト", name: "v1-updated" };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleVersion]),
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
    const res = await app.request("/api/prompt-versions/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "更新されたプロンプト", name: "v1-updated" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.content).toBe("更新されたプロンプト");
    expect(body.name).toBe("v1-updated");
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
    const res = await app.request("/api/prompt-versions/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "更新" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PromptVersion not found");
  });

  it("content が空文字列のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "更新" }),
    });

    expect(res.status).toBe(400);
  });

  it("非分岐バージョンで name を空にすると自動命名に戻す", async () => {
    const updated = { ...sampleVersion, name: "プロンプト 1" };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleVersion]),
        }),
      }),
      update: () => ({
        set: (values: { name: string }) => ({
          where: () => ({
            returning: () => {
              expect(values.name).toBe("プロンプト 1");
              return Promise.resolve([updated]);
            },
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.name).toBe("プロンプト 1");
  });

  it("PATCH で workflow_definition の step.id が重複すると400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow_definition: {
          steps: [
            { id: "extract", title: "抽出1", prompt: "内容を抽出してください" },
            { id: "extract", title: "抽出2", prompt: "要約してください" },
          ],
        },
      }),
    });

    expect(res.status).toBe(400);
  });
});

// ---- PATCH /api/projects/:projectId/prompt-versions/:id ----

describe("PATCH /api/projects/:projectId/prompt-versions/:id", () => {
  it("legacy path で project にリンクされた version を更新できる", async () => {
    const updated = { ...sampleVersion, content: "互換更新後", project_id: null };
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([{ prompt_version_id: 1 }]);
            }
            return Promise.resolve([sampleVersion]);
          },
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

    const res = await buildLegacyApp(db).request("/api/projects/7/prompt-versions/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "互換更新後" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.content).toBe("互換更新後");
    expect(body.project_id).toBe(7);
  });
});

// ---- POST /api/prompt-versions/:id/branch ----

describe("POST /api/prompt-versions/:id/branch", () => {
  it("分岐作成時に parent_version_id と prompt_family_id が正しく引き継がれる", async () => {
    const branched: MockPromptVersion = {
      ...sampleVersion,
      id: 2,
      version: 2,
      name: "分岐バージョン",
      parent_version_id: 1,
    };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleVersion]),
        }),
      }),
      insert: () => ({
        values: (values: {
          parent_version_id: number;
          version: number;
          prompt_family_id: number;
        }) => ({
          returning: () => {
            expect(values.parent_version_id).toBe(1);
            expect(values.prompt_family_id).toBe(10);
            return Promise.resolve([branched]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "分岐バージョン" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.parent_version_id).toBe(1);
    expect(body.name).toBe("分岐バージョン");
  });

  it("分岐作成時に親のcontentが引き継がれる", async () => {
    const branched: MockPromptVersion = {
      ...sampleVersion,
      id: 2,
      version: 2,
      content: sampleVersion.content,
      parent_version_id: 1,
    };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleVersion]),
        }),
      }),
      insert: () => ({
        values: (values: { content: string }) => ({
          returning: () => {
            expect(values.content).toBe(sampleVersion.content);
            return Promise.resolve([branched]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.content).toBe(sampleVersion.content);
  });

  it("分岐作成時に family 単位で version 番号が自動採番される", async () => {
    const branched: MockPromptVersion = {
      ...sampleVersion,
      id: 2,
      version: 2,
      parent_version_id: 1,
    };

    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleVersion]);
            }
            return Promise.resolve([{ maxVersion: 1 }]);
          },
        }),
      }),
      insert: () => ({
        values: (values: { version: number }) => ({
          returning: () => {
            expect(values.version).toBe(2);
            return Promise.resolve([branched]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.version).toBe(2);
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
    const res = await app.request("/api/prompt-versions/999/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PromptVersion not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/abc/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

// ---- POST /api/projects/:projectId/prompt-versions/:id/branch ----

describe("POST /api/projects/:projectId/prompt-versions/:id/branch", () => {
  it("legacy path で branch 作成時に project_id を維持し project link を張る", async () => {
    const branched: MockPromptVersion = {
      ...sampleVersion,
      id: 2,
      version: 2,
      project_id: 7,
      parent_version_id: 1,
    };
    let selectCallCount = 0;
    let insertCallCount = 0;

    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([{ prompt_version_id: 1 }]);
            }
            if (selectCallCount === 2) {
              return Promise.resolve([sampleVersion]);
            }
            return Promise.resolve([{ maxVersion: 1 }]);
          },
        }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertCallCount++;
          if (insertCallCount === 1) {
            expect(values.parent_version_id).toBe(1);
            expect(values.project_id).toBe(7);
            return {
              returning: () => Promise.resolve([branched]),
            };
          }
          expect(values.prompt_version_id).toBe(2);
          expect(values.project_id).toBe(7);
          return Promise.resolve();
        },
      }),
    };

    const res = await buildLegacyApp(db).request("/api/projects/7/prompt-versions/1/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "branch" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.parent_version_id).toBe(1);
    expect(body.project_id).toBe(7);
  });
});

// ---- PATCH /api/prompt-versions/:id/selected ----

describe("PATCH /api/prompt-versions/:id/selected", () => {
  it("family内で選択状態を切り替えて200で返す", async () => {
    const updated = { ...sampleVersion, is_selected: true };

    let updateCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleVersion]),
        }),
      }),
      update: () => ({
        set: (values: { is_selected: boolean }) => ({
          where: () => {
            updateCallCount++;
            if (updateCallCount === 1) {
              expect(values.is_selected).toBe(false);
              return Promise.resolve([]);
            }
            expect(values.is_selected).toBe(true);
            return {
              returning: () => Promise.resolve([updated]),
            };
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1/selected", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.is_selected).toBe(true);
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
    const res = await app.request("/api/prompt-versions/999/selected", {
      method: "PATCH",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PromptVersion not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/abc/selected", {
      method: "PATCH",
    });

    expect(res.status).toBe(400);
  });
});

// ---- PATCH /api/projects/:projectId/prompt-versions/:id/selected ----

describe("PATCH /api/projects/:projectId/prompt-versions/:id/selected", () => {
  it("legacy path でも selected 切り替え結果の project_id を補完する", async () => {
    const updated = { ...sampleVersion, is_selected: true, project_id: null };
    let selectCallCount = 0;
    let updateCallCount = 0;

    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([{ prompt_version_id: 1 }]);
            }
            return Promise.resolve([sampleVersion]);
          },
        }),
      }),
      update: () => ({
        set: (values: { is_selected: boolean }) => ({
          where: () => {
            updateCallCount++;
            if (updateCallCount === 1) {
              expect(values.is_selected).toBe(false);
              return Promise.resolve([]);
            }
            return {
              returning: () => Promise.resolve([updated]),
            };
          },
        }),
      }),
    };

    const res = await buildLegacyApp(db).request("/api/projects/7/prompt-versions/1/selected", {
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.is_selected).toBe(true);
    expect(body.project_id).toBe(7);
  });
});

// ---- PUT /api/prompt-versions/:id/projects ----

describe("PUT /api/prompt-versions/:id/projects", () => {
  it("project_id を設定して200で返す", async () => {
    const updated = { ...sampleVersion, project_id: 5 };
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: (_table?: unknown) => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleVersion]);
            }
            return Promise.resolve([{ id: 5 }]);
          },
        }),
      }),
      update: () => ({
        set: (values: { project_id: number | null }) => ({
          where: () => ({
            returning: () => {
              expect(values.project_id).toBe(5);
              return Promise.resolve([updated]);
            },
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: 5 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.project_id).toBe(5);
  });

  it("存在しない project_id を指定すると 404 を返す", async () => {
    let updateCalled = false;
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: (_table?: unknown) => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleVersion]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
      update: () => ({
        set: () => {
          updateCalled = true;
          return {
            where: () => ({
              returning: () => Promise.resolve([]),
            }),
          };
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: 999 }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Project not found" });
    expect(updateCalled).toBe(false);
  });

  it("project_id を null にして紐付けを解除できる", async () => {
    const updated = { ...sampleVersion, project_id: null };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ ...sampleVersion, project_id: 5 }]),
        }),
      }),
      update: () => ({
        set: (values: { project_id: number | null }) => ({
          where: () => ({
            returning: () => {
              expect(values.project_id).toBeNull();
              return Promise.resolve([updated]);
            },
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: null }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.project_id).toBeNull();
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
    const res = await app.request("/api/prompt-versions/999/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: 1 }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PromptVersion not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/prompt-versions/abc/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: 1 }),
    });

    expect(res.status).toBe(400);
  });
});
