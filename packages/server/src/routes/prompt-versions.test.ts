/**
 * PromptVersion CRUD + 分岐エンドポイントのテスト
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
import { createPromptVersionsRouter } from "./prompt-versions.js";

// ---- 型定義 ----

type MockPromptVersion = {
  id: number;
  project_id: number;
  version: number;
  name: string | null;
  memo: string | null;
  content: string;
  workflow_definition: { steps: Array<{ id: string; title: string; prompt: string }> } | null;
  parent_version_id: number | null;
  created_at: number;
};

// ---- ヘルパー ----

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/projects/:projectId/prompt-versions", createPromptVersionsRouter(db as DB));
  return app;
}

// ---- テストデータ ----

const sampleVersion: MockPromptVersion = {
  id: 1,
  project_id: 1,
  version: 1,
  name: "初期バージョン",
  memo: null,
  content: "あなたは親切なアシスタントです。",
  workflow_definition: null,
  parent_version_id: null,
  created_at: 1000000,
};

// ---- テスト ----

describe("GET /api/projects/:projectId/prompt-versions", () => {
  it("バージョン一覧を200で返す", async () => {
    const versions = [sampleVersion, { ...sampleVersion, id: 2, version: 2, name: "v2" }];

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(versions),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.version).toBe(1);
    expect(body.at(1)?.version).toBe(2);
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
    const res = await app.request("/api/projects/1/prompt-versions");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion[];
    expect(body).toHaveLength(0);
  });
});

describe("POST /api/projects/:projectId/prompt-versions", () => {
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
    const res = await app.request("/api/projects/1/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "あなたは親切なアシスタントです。", name: "初期バージョン" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.content).toBe("あなたは親切なアシスタントです。");
    expect(body.name).toBe("初期バージョン");
  });

  it("version番号が既存の最大値+1で採番される", async () => {
    const created = { ...sampleVersion, id: 3, version: 3 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ maxVersion: 2 }]),
        }),
      }),
      insert: () => ({
        values: (values: { version: number }) => ({
          returning: () => {
            // 採番された version が 3 になっているか検証
            expect(values.version).toBe(3);
            return Promise.resolve([created]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "新しいプロンプト", name: "新しいプロンプト" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.version).toBe(3);
  });

  it("プロジェクト内にバージョンが0件の場合、version=1 で採番される", async () => {
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
    const res = await app.request("/api/projects/1/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "初めてのプロンプト", name: "初めてのプロンプト" }),
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
    const res = await app.request("/api/projects/1/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "初めてのプロンプト" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.name).toBe("プロンプト 2");
  });

  it("content が空文字列のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("content が未指定のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "名前だけ" }),
    });

    expect(res.status).toBe(400);
  });

});

describe("GET /api/projects/:projectId/prompt-versions/:id", () => {
  it("存在するIDに対して200でバージョンを返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleVersion]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.id).toBe(1);
    expect(body.content).toBe("あなたは親切なアシスタントです。");
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
    const res = await app.request("/api/projects/1/prompt-versions/999");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PromptVersion not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/abc");

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
    const res = await app.request("/api/projects/1/prompt-versions/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.name).toBe("プロンプト 1");
  });
});

describe("PATCH /api/projects/:projectId/prompt-versions/:id", () => {
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
    const res = await app.request("/api/projects/1/prompt-versions/1", {
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
    const res = await app.request("/api/projects/1/prompt-versions/999", {
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
    const res = await app.request("/api/projects/1/prompt-versions/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "更新" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/projects/:projectId/prompt-versions/:id/branch", () => {
  it("分岐作成時に parent_version_id が正しく設定される", async () => {
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
        values: (values: { parent_version_id: number; version: number }) => ({
          returning: () => {
            // parent_version_id が親の id (1) に設定されていることを確認
            expect(values.parent_version_id).toBe(1);
            return Promise.resolve([branched]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/1/branch", {
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
            // 親の content が引き継がれていることを確認
            expect(values.content).toBe(sampleVersion.content);
            return Promise.resolve([branched]);
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/prompt-versions/1/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockPromptVersion;
    expect(body.content).toBe(sampleVersion.content);
  });

  it("分岐作成時に version 番号が自動採番される", async () => {
    const branched: MockPromptVersion = {
      ...sampleVersion,
      id: 2,
      version: 2,
      parent_version_id: 1,
    };

    // select が2回呼ばれる: 1回目は親バージョン取得, 2回目は maxVersion 取得
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // 親バージョン取得
              return Promise.resolve([sampleVersion]);
            }
            // maxVersion 取得
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
    const res = await app.request("/api/projects/1/prompt-versions/1/branch", {
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
    const res = await app.request("/api/projects/1/prompt-versions/999/branch", {
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
    const res = await app.request("/api/projects/1/prompt-versions/abc/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
