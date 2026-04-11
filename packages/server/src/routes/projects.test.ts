/**
 * Project CRUD エンドポイントのテスト
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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectsRouter } from "./projects.js";

// ---- モックDBの型定義 ----

type MockProject = {
  id: number;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
};

/**
 * Drizzle の select().from().where() チェーンを模倣するモックビルダー
 */
function createMockDb(initialProjects: MockProject[] = []) {
  let store = [...initialProjects];
  let nextId = Math.max(0, ...store.map((p) => p.id)) + 1;

  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockImplementation(() => Promise.resolve([...store])),
        where: vi.fn().mockImplementation((condition: unknown) => {
          // condition は eq(projects.id, id) の形式。
          // テスト用に id を直接取り出す方法がないため、
          // where のモックは呼び出し元のコンテキストから id を受け取る仕組みにする。
          // 実装上は _whereId を使う。
          return Promise.resolve([] as MockProject[]);
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          return Promise.resolve([] as MockProject[]);
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => Promise.resolve([] as MockProject[])),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => Promise.resolve()),
    }),
    _store: store,
  };

  return {
    mockDb,
    store: () => store,
    setStore: (s: MockProject[]) => {
      store = s;
    },
    getNextId: () => nextId++,
  };
}

/**
 * テスト用にルーターを組み立てる。
 * DBモックを渡して各エンドポイントの動作を検証する。
 */
function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/projects", createProjectsRouter(db as DB));
  return app;
}

// ---- テストデータ ----

const sampleProject: MockProject = {
  id: 1,
  name: "テストプロジェクト",
  description: "説明文",
  created_at: 1000000,
  updated_at: 1000000,
};

// ---- テスト ----

describe("GET /api/projects", () => {
  it("プロジェクト一覧を200で返す", async () => {
    const projects = [sampleProject, { ...sampleProject, id: 2, name: "別プロジェクト" }];

    const db = {
      select: () => ({
        from: () => ({
          orderBy: () => Promise.resolve(projects),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockProject[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.name).toBe("テストプロジェクト");
    expect(body.at(1)?.name).toBe("別プロジェクト");
  });

  it("プロジェクトが0件のとき空配列を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          orderBy: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockProject[];
    expect(body).toHaveLength(0);
  });
});

describe("POST /api/projects", () => {
  it("バリデーション通過時に201でプロジェクトを返す", async () => {
    const created = { ...sampleProject };

    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "テストプロジェクト", description: "説明文" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockProject;
    expect(body.name).toBe("テストプロジェクト");
    expect(body.description).toBe("説明文");
  });

  it("name が空文字列のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("name が未指定のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "説明だけ" }),
    });

    expect(res.status).toBe(400);
  });

  it("description 省略時も正常に作成できる", async () => {
    const created = { ...sampleProject, description: null };

    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "テストプロジェクト" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockProject;
    expect(body.name).toBe("テストプロジェクト");
    expect(body.description).toBeNull();
  });
});

describe("GET /api/projects/:id", () => {
  it("存在するIDに対して200でプロジェクトを返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleProject]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockProject;
    expect(body.id).toBe(1);
    expect(body.name).toBe("テストプロジェクト");
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
    const res = await app.request("/api/projects/999");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/abc");

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("存在するIDに対して200で更新されたプロジェクトを返す", async () => {
    const updated = { ...sampleProject, name: "更新後の名前", updated_at: 2000000 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleProject]),
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
    const res = await app.request("/api/projects/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後の名前" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockProject;
    expect(body.name).toBe("更新後の名前");
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
    const res = await app.request("/api/projects/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project not found");
  });

  it("name が空文字列のとき400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("存在するIDに対して204を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleProject]),
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1", {
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
    const res = await app.request("/api/projects/999", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};

    const app = buildApp(db);
    const res = await app.request("/api/projects/abc", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
  });
});
