/**
 * TestCase CRUD エンドポイントのテスト
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
import type { Turn } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createTestCasesRouter } from "./test-cases.js";

// ---- モックDB型定義 ----

type MockTestCase = {
  id: number;
  project_id: number;
  title: string;
  turns: string;
  context_content: string;
  expected_description: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
};

type ParsedTestCase = Omit<MockTestCase, "turns"> & { turns: Turn[] };

/**
 * テスト用にルーターを組み立てる。
 * DBモックを渡して各エンドポイントの動作を検証する。
 */
function buildApp(db: unknown) {
  const app = new Hono();
  // Honoのルート登録でparamを伝播させるためにネストする
  app.route("/api/projects/:projectId/test-cases", createTestCasesRouter(db as DB));
  return app;
}

// ---- テストデータ ----

const sampleTurns: Turn[] = [{ role: "user", content: "テスト入力" }];

const sampleTestCase: MockTestCase = {
  id: 1,
  project_id: 1,
  title: "サンプルテストケース",
  turns: JSON.stringify(sampleTurns),
  context_content: "",
  expected_description: "期待される出力",
  display_order: 0,
  created_at: 1000000,
  updated_at: 1000000,
};

// ---- GET /api/projects/:projectId/test-cases ----

describe("GET /api/projects/:projectId/test-cases", () => {
  it("テストケース一覧を200で返す", async () => {
    const testCases = [
      sampleTestCase,
      { ...sampleTestCase, id: 2, title: "別テストケース", display_order: 1 },
    ];

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(testCases),
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.title).toBe("サンプルテストケース");
    expect(body.at(0)?.turns).toEqual(sampleTurns);
    expect(body.at(1)?.title).toBe("別テストケース");
  });

  it("テストケースが0件のとき空配列を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([]),
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body).toHaveLength(0);
  });

  it("turnsがJSONパースされた配列として返される", async () => {
    const multiTurns: Turn[] = [
      { role: "user", content: "質問1" },
      { role: "assistant", content: "回答1" },
      { role: "user", content: "質問2" },
    ];
    const tc = { ...sampleTestCase, turns: JSON.stringify(multiTurns) };

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([tc]),
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body.at(0)?.turns).toEqual(multiTurns);
  });
});

// ---- POST /api/projects/:projectId/test-cases ----

describe("POST /api/projects/:projectId/test-cases", () => {
  it("バリデーション通過時に201でテストケースを返す", async () => {
    const created = { ...sampleTestCase };

    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "サンプルテストケース",
        turns: sampleTurns,
        expected_description: "期待される出力",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.title).toBe("サンプルテストケース");
    expect(body.turns).toEqual(sampleTurns);
  });

  it("title が空文字列のとき400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", turns: sampleTurns }),
    });

    expect(res.status).toBe(400);
  });

  it("title が未指定のとき400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns: sampleTurns }),
    });

    expect(res.status).toBe(400);
  });

  it("turns が空配列のとき空の会話履歴として作成する", async () => {
    const created = { ...sampleTestCase, title: "テスト", turns: JSON.stringify([]) };
    const values = vi.fn(() => ({
      returning: () => Promise.resolve([created]),
    }));
    const db = {
      insert: () => ({
        values,
      }),
    };
    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "テスト", turns: [] }),
    });

    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "テスト",
        turns: "[]",
      }),
    );
    const body = (await res.json()) as ParsedTestCase;
    expect(body.turns).toEqual([]);
  });

  it("turns が未指定のとき空の会話履歴として作成する", async () => {
    const created = { ...sampleTestCase, title: "テスト", turns: JSON.stringify([]) };
    const values = vi.fn(() => ({
      returning: () => Promise.resolve([created]),
    }));
    const db = {
      insert: () => ({
        values,
      }),
    };
    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "テスト" }),
    });

    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "テスト",
        turns: "[]",
      }),
    );
    const body = (await res.json()) as ParsedTestCase;
    expect(body.turns).toEqual([]);
  });

  it("マルチターンのturnsが正しく保存・返却される", async () => {
    const multiTurns: Turn[] = [
      { role: "user", content: "質問" },
      { role: "assistant", content: "回答" },
    ];
    const created = {
      ...sampleTestCase,
      turns: JSON.stringify(multiTurns),
    };

    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "マルチターン", turns: multiTurns }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.turns).toEqual(multiTurns);
  });

  it("display_order を指定した場合に正しく反映される", async () => {
    const created = { ...sampleTestCase, display_order: 5 };

    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "テスト", turns: sampleTurns, display_order: 5 }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.display_order).toBe(5);
  });
});

// ---- GET /api/projects/:projectId/test-cases/:id ----

describe("GET /api/projects/:projectId/test-cases/:id", () => {
  it("存在するIDに対して200でテストケースを返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.id).toBe(1);
    expect(body.title).toBe("サンプルテストケース");
    expect(body.turns).toEqual(sampleTurns);
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
    const res = await app.request("/api/projects/1/test-cases/999");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("TestCase not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases/abc");

    expect(res.status).toBe(400);
  });

  it("数値以外のprojectIdに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/projects/abc/test-cases/1");

    expect(res.status).toBe(400);
  });
});

// ---- PATCH /api/projects/:projectId/test-cases/:id ----

describe("PATCH /api/projects/:projectId/test-cases/:id", () => {
  it("存在するIDに対して200で更新されたテストケースを返す", async () => {
    const updated = { ...sampleTestCase, title: "更新後のタイトル", updated_at: 2000000 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
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
    const res = await app.request("/api/projects/1/test-cases/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後のタイトル" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.title).toBe("更新後のタイトル");
    expect(body.turns).toEqual(sampleTurns);
  });

  it("turnsを更新するとパース済み配列で返却される", async () => {
    const newTurns: Turn[] = [
      { role: "user", content: "新しい質問" },
      { role: "assistant", content: "新しい回答" },
    ];
    const updated = { ...sampleTestCase, turns: JSON.stringify(newTurns), updated_at: 2000000 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
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
    const res = await app.request("/api/projects/1/test-cases/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns: newTurns }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.turns).toEqual(newTurns);
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
    const res = await app.request("/api/projects/1/test-cases/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("TestCase not found");
  });

  it("title が空文字列のとき400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後" }),
    });

    expect(res.status).toBe(400);
  });
});

// ---- DELETE /api/projects/:projectId/test-cases/:id ----

describe("DELETE /api/projects/:projectId/test-cases/:id", () => {
  it("存在するIDに対して204を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
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
    const res = await app.request("/api/projects/1/test-cases/999", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("TestCase not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/projects/1/test-cases/abc", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
  });
});
