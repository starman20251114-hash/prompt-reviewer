/**
 * TestCase CRUD エンドポイントのテスト（独立資産モデル）
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * 実際のDB接続は行わず、Drizzle の DB インターフェースを模倣した
 * モックを使用してルートハンドラの動作を検証する。
 *
 * テストケースは project に依存しない独立資産として管理される。
 * プロジェクトへの紐付けは test_case_projects 中間テーブル経由。
 * context asset 関連付けは test_case_context_assets 中間テーブル経由。
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
  app.route("/api/test-cases", createTestCasesRouter(db as DB));
  return app;
}

// ---- テストデータ ----

const sampleTurns: Turn[] = [{ role: "user", content: "テスト入力" }];

const sampleTestCase: MockTestCase = {
  id: 1,
  title: "サンプルテストケース",
  turns: JSON.stringify(sampleTurns),
  context_content: "",
  expected_description: "期待される出力",
  display_order: 0,
  created_at: 1000000,
  updated_at: 1000000,
};

// ---- GET /api/test-cases ----

describe("GET /api/test-cases", () => {
  it("テストケース一覧を200で返す", async () => {
    const testCases = [
      sampleTestCase,
      { ...sampleTestCase, id: 2, title: "別テストケース", display_order: 1 },
    ];

    const db = {
      select: () => ({
        from: () => Promise.resolve(testCases),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases");

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
        from: () => Promise.resolve([]),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases");

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
        from: () => Promise.resolve([tc]),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body.at(0)?.turns).toEqual(multiTurns);
  });

  it("project_idが無効な値のとき400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases?project_id=abc");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid project_id");
  });

  it("unclassifiedが無効な値のとき400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases?unclassified=invalid");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid unclassified");
  });

  it("project_idフィルタが有効なとき該当テストケースのみ返す", async () => {
    const tc1 = { ...sampleTestCase, id: 1 };
    const tc2 = { ...sampleTestCase, id: 2, title: "別テストケース" };
    const allCases = [tc1, tc2];

    const links = [{ test_case_id: 1 }]; // project 10 に id=1 のみ紐付き

    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: (table: unknown) => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // test_cases の全件取得
            return Promise.resolve(allCases);
          }
          // test_case_projects のフィルタ
          return {
            where: () => Promise.resolve(links),
          };
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases?project_id=10");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body).toHaveLength(1);
    expect(body.at(0)?.id).toBe(1);
  });
});

// ---- POST /api/test-cases ----

describe("POST /api/test-cases", () => {
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
    const res = await app.request("/api/test-cases", {
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

  it("レスポンスに project_id が含まれない（独立資産モデル）", async () => {
    const created = { ...sampleTestCase };

    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "テスト", turns: sampleTurns }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("project_id");
  });

  it("title が空文字列のとき400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", turns: sampleTurns }),
    });

    expect(res.status).toBe(400);
  });

  it("title が未指定のとき400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases", {
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
    const res = await app.request("/api/test-cases", {
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
    const res = await app.request("/api/test-cases", {
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
    const res = await app.request("/api/test-cases", {
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
    const res = await app.request("/api/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "テスト", turns: sampleTurns, display_order: 5 }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.display_order).toBe(5);
  });
});

// ---- GET /api/test-cases/:id ----

describe("GET /api/test-cases/:id", () => {
  it("存在するIDに対して200でテストケースを返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.id).toBe(1);
    expect(body.title).toBe("サンプルテストケース");
    expect(body.turns).toEqual(sampleTurns);
  });

  it("レスポンスに project_id が含まれない（独立資産モデル）", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("project_id");
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
    const res = await app.request("/api/test-cases/999");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("TestCase not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases/abc");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });
});

// ---- PATCH /api/test-cases/:id ----

describe("PATCH /api/test-cases/:id", () => {
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
    const res = await app.request("/api/test-cases/1", {
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
    const res = await app.request("/api/test-cases/1", {
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
    const res = await app.request("/api/test-cases/999", {
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
    const res = await app.request("/api/test-cases/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });
});

// ---- DELETE /api/test-cases/:id ----

describe("DELETE /api/test-cases/:id", () => {
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
    const res = await app.request("/api/test-cases/1", {
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
    const res = await app.request("/api/test-cases/999", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("TestCase not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases/abc", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });

  it("削除時に中間テーブル（test_case_projects, test_case_context_assets）も削除される", async () => {
    const deletedTables: string[] = [];

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
        }),
      }),
      delete: (table: { _: { name?: string } }) => {
        deletedTables.push(String(table));
        return {
          where: () => Promise.resolve(),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    // deleteが3回呼ばれる（test_case_projects, test_case_context_assets, test_cases）
    expect(deletedTables).toHaveLength(3);
  });
});

// ---- PUT /api/test-cases/:id/projects ----

describe("PUT /api/test-cases/:id/projects", () => {
  it("有効なプロジェクトIDでラベル付けすると200でテストケースを返す", async () => {
    const project = {
      id: 10,
      name: "プロジェクト",
      description: null,
      created_at: 1000,
      updated_at: 1000,
    };

    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleTestCase]); // test_cases
            }
            return Promise.resolve([project]); // projects
          },
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
      insert: () => ({
        values: () => Promise.resolve([]),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [10] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.id).toBe(1);
    expect(body.turns).toEqual(sampleTurns);
  });

  it("空のproject_idsで関連を全解除できる", async () => {
    const deleteWhere = vi.fn(() => Promise.resolve());
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
        }),
      }),
      delete: () => ({
        where: deleteWhere,
      }),
      insert: () => ({
        values: () => Promise.resolve([]),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [] }),
    });

    expect(res.status).toBe(200);
    // deleteが呼ばれて既存関連が削除される
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("存在しないプロジェクトIDのとき404を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleTestCase]); // test_cases
            }
            return Promise.resolve([]); // projects（存在しない）
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [999] }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project not found");
  });

  it("存在しないテストケースIDのとき404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/999/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [1] }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("TestCase not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases/abc/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [1] }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });

  it("重複するproject_idは1つにまとめて挿入する", async () => {
    const project = {
      id: 10,
      name: "プロジェクト",
      description: null,
      created_at: 1000,
      updated_at: 1000,
    };
    const insertValues = vi.fn(() => Promise.resolve([]));

    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleTestCase]);
            }
            return Promise.resolve([project]);
          },
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
      insert: () => ({
        values: insertValues,
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [10, 10, 10] }),
    });

    expect(res.status).toBe(200);
    // 重複除去で1回のみ挿入される
    expect(insertValues).toHaveBeenCalledTimes(1);
  });
});

// ---- PUT /api/test-cases/:id/context-assets ----

describe("PUT /api/test-cases/:id/context-assets", () => {
  const sampleAsset = {
    id: 20,
    name: "テスト素材",
    path: "/test.txt",
    content: "サンプルコンテンツ",
    mime_type: "text/plain",
    content_hash: "sha256:abc",
    created_at: 1000,
    updated_at: 1000,
  };

  it("有効なcontext_asset_idsで関連付けすると200でテストケースを返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleTestCase]); // test_cases
            }
            return Promise.resolve([sampleAsset]); // context_assets
          },
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
      insert: () => ({
        values: () => Promise.resolve([]),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1/context-assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_asset_ids: [20] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.id).toBe(1);
  });

  it("空のcontext_asset_idsで関連を全解除できる", async () => {
    const deleteWhere = vi.fn(() => Promise.resolve());
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTestCase]),
        }),
      }),
      delete: () => ({
        where: deleteWhere,
      }),
      insert: () => ({
        values: () => Promise.resolve([]),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1/context-assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_asset_ids: [] }),
    });

    expect(res.status).toBe(200);
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("存在しないcontext_asset_idのとき404を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleTestCase]);
            }
            return Promise.resolve([]); // context_assets（存在しない）
          },
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1/context-assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_asset_ids: [999] }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ContextAsset not found");
  });

  it("存在しないテストケースIDのとき404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/999/context-assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_asset_ids: [20] }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("TestCase not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const db = {};
    const app = buildApp(db);
    const res = await app.request("/api/test-cases/abc/context-assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_asset_ids: [20] }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });

  it("重複するcontext_asset_idは1つにまとめて挿入する", async () => {
    const insertValues = vi.fn(() => Promise.resolve([]));

    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleTestCase]);
            }
            return Promise.resolve([sampleAsset]);
          },
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
      insert: () => ({
        values: insertValues,
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/test-cases/1/context-assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_asset_ids: [20, 20, 20] }),
    });

    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalledTimes(1);
  });
});
