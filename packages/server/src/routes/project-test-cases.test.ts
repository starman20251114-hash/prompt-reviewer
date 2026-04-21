/**
 * 旧 /projects/:projectId/test-cases 互換レイヤーのテスト
 *
 * 内部的には test_case_projects で project フィルタを行い、
 * レスポンスには project_id を補完して返す。
 */

vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import type { Turn } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createProjectTestCasesRouter } from "./project-test-cases.js";

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

type ParsedTestCase = Omit<MockTestCase, "turns"> & {
  turns: Turn[];
  project_id: number;
};

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/projects/:projectId/test-cases", createProjectTestCasesRouter(db as DB));
  return app;
}

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

// ---- GET /api/projects/:projectId/test-cases ----

describe("GET /api/projects/:projectId/test-cases", () => {
  it("プロジェクトに紐付くテストケースを200で返す", async () => {
    const tc2 = { ...sampleTestCase, id: 2, title: "別テストケース", display_order: 1 };
    const links = [{ test_case_id: 1 }, { test_case_id: 2 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // test_case_projects
            return {
              where: () => Promise.resolve(links),
            };
          }
          // test_cases
          return Promise.resolve([sampleTestCase, tc2]);
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.title).toBe("サンプルテストケース");
    expect(body.at(0)?.turns).toEqual(sampleTurns);
    expect(body.at(0)?.project_id).toBe(10);
  });

  it("プロジェクトに紐付くテストケースがない場合は空配列を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body).toHaveLength(0);
  });

  it("レスポンスに project_id が含まれる（旧API互換）", async () => {
    const links = [{ test_case_id: 1 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve(links) };
          }
          return Promise.resolve([sampleTestCase]);
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body.at(0)).toHaveProperty("project_id", 10);
  });

  it("他プロジェクトのテストケースはフィルタされる", async () => {
    // project 10 には id=1 のみ紐付き、id=2 は別プロジェクト
    const links = [{ test_case_id: 1 }];
    const allCases = [sampleTestCase, { ...sampleTestCase, id: 2, title: "別プロジェクト" }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve(links) };
          }
          return Promise.resolve(allCases);
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body).toHaveLength(1);
    expect(body.at(0)?.id).toBe(1);
  });

  it("display_order でソートされる", async () => {
    const tc1 = { ...sampleTestCase, id: 1, display_order: 5 };
    const tc2 = { ...sampleTestCase, id: 2, title: "先頭", display_order: 0 };
    const links = [{ test_case_id: 1 }, { test_case_id: 2 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve(links) };
          }
          return Promise.resolve([tc1, tc2]);
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    expect(body.at(0)?.id).toBe(2);
    expect(body.at(1)?.id).toBe(1);
  });
});

// ---- POST /api/projects/:projectId/test-cases ----

describe("POST /api/projects/:projectId/test-cases", () => {
  it("テストケースを作成してプロジェクトに紐付け、201で返す", async () => {
    const created = { ...sampleTestCase };
    const insertValues: unknown[] = [];
    let insertCount = 0;

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ id: 10, name: "プロジェクト" }]),
        }),
      }),
      insert: () => {
        insertCount++;
        if (insertCount === 1) {
          return {
            values: (v: unknown) => {
              insertValues.push(v);
              return { returning: () => Promise.resolve([created]) };
            },
          };
        }
        return {
          values: (v: unknown) => {
            insertValues.push(v);
            return Promise.resolve();
          },
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "サンプルテストケース", turns: sampleTurns }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.title).toBe("サンプルテストケース");
    expect(body.project_id).toBe(10);
    // test_case_projects にも挿入されていること
    expect(insertValues).toHaveLength(2);
    expect(insertValues[1]).toMatchObject({ test_case_id: created.id, project_id: 10 });
  });

  it("project_ids フィールドなし（パスから projectId を使う）", async () => {
    const created = { ...sampleTestCase };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ id: 5, name: "P" }]),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/5/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "テスト", turns: [] }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.project_id).toBe(5);
  });

  it("存在しないプロジェクトIDのとき404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/999/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "テスト", turns: [] }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project not found");
  });

  it("title が空文字列のとき400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/projects/10/test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", turns: [] }),
    });

    expect(res.status).toBe(400);
  });
});

// ---- GET /api/projects/:projectId/test-cases/:id ----

describe("GET /api/projects/:projectId/test-cases/:id", () => {
  it("プロジェクトに紐付くテストケースを200で返す", async () => {
    const links = [{ test_case_id: 1 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve([sampleTestCase]) };
          }
          // test_case_projects
          return { where: () => Promise.resolve(links) };
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.id).toBe(1);
    expect(body.project_id).toBe(10);
    expect(body.turns).toEqual(sampleTurns);
  });

  it("別プロジェクトのテストケースは404を返す", async () => {
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve([sampleTestCase]) };
          }
          // project 10 にはid=1が紐付いていない
          return { where: () => Promise.resolve([]) };
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases/1");

    expect(res.status).toBe(404);
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
    const res = await app.request("/api/projects/10/test-cases/999");

    expect(res.status).toBe(404);
  });

  it("数値以外のIDに対して400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/projects/10/test-cases/abc");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });
});

// ---- PATCH /api/projects/:projectId/test-cases/:id ----

describe("PATCH /api/projects/:projectId/test-cases/:id", () => {
  it("プロジェクトに紐付くテストケースを更新して200で返す", async () => {
    const updated = { ...sampleTestCase, title: "更新後", updated_at: 2000000 };
    const links = [{ test_case_id: 1 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve([sampleTestCase]) };
          }
          return { where: () => Promise.resolve(links) };
        },
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
    const res = await app.request("/api/projects/10/test-cases/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase;
    expect(body.title).toBe("更新後");
    expect(body.project_id).toBe(10);
  });

  it("別プロジェクトのテストケースは404を返す", async () => {
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve([sampleTestCase]) };
          }
          return { where: () => Promise.resolve([]) };
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後" }),
    });

    expect(res.status).toBe(404);
  });

  it("annotation済みのcontext_content更新は409を返す", async () => {
    const links = [{ test_case_id: 1 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve([sampleTestCase]) };
          }
          if (selectCallCount === 2) {
            return { where: () => Promise.resolve(links) };
          }
          // annotation_candidates チェック
          return {
            where: () => ({
              limit: () => Promise.resolve([{ id: 99 }]),
            }),
          };
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_content: "新しいコンテンツ" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("annotation済み");
  });
});

// ---- DELETE /api/projects/:projectId/test-cases/:id ----

describe("DELETE /api/projects/:projectId/test-cases/:id", () => {
  it("プロジェクトに紐付くテストケースを削除して204を返す", async () => {
    const links = [{ test_case_id: 1 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve([sampleTestCase]) };
          }
          return { where: () => Promise.resolve(links) };
        },
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
  });

  it("別プロジェクトのテストケースは404を返す", async () => {
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve([sampleTestCase]) };
          }
          return { where: () => Promise.resolve([]) };
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });

  it("削除時に中間テーブルも削除される", async () => {
    const links = [{ test_case_id: 1 }];
    const deletedTables: string[] = [];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { where: () => Promise.resolve([sampleTestCase]) };
          }
          return { where: () => Promise.resolve(links) };
        },
      }),
      delete: (table: unknown) => {
        deletedTables.push(String(table));
        return { where: () => Promise.resolve() };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    // test_case_projects, test_case_context_assets, test_cases の3テーブル削除
    expect(deletedTables).toHaveLength(3);
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
    const res = await app.request("/api/projects/10/test-cases/999", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });

  it("数値以外のIDに対して400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/projects/10/test-cases/abc", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid ID");
  });
});

// ---- 新旧 API 同値テスト ----

describe("新旧 API 同値テスト", () => {
  it("GET /projects/X/test-cases は project_id 付きで同じテストケース本体を返す", async () => {
    // 旧API（互換レイヤー）のレスポンス検証
    // test_case_projects → test_cases の順にselect
    const links = [{ test_case_id: 1 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // test_case_projects
            return { where: () => Promise.resolve(links) };
          }
          // test_cases
          return Promise.resolve([sampleTestCase]);
        },
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/10/test-cases");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ParsedTestCase[];
    const tc = body.at(0);

    // 本体フィールドが正しく返る
    expect(tc?.id).toBe(sampleTestCase.id);
    expect(tc?.title).toBe(sampleTestCase.title);
    expect(tc?.turns).toEqual(sampleTurns);
    expect(tc?.context_content).toBe(sampleTestCase.context_content);
    expect(tc?.expected_description).toBe(sampleTestCase.expected_description);

    // 旧API互換: project_id が補完されている
    expect(tc).toHaveProperty("project_id", 10);
  });

  it("GET /test-cases?project_id=X のレスポンスには project_id が含まれない（新APIモデル）", async () => {
    const { createTestCasesRouter } = await import("./test-cases.js");

    const links = [{ test_case_id: 1 }];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: (table: unknown) => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // test_cases（新APIはtest_casesを先に全件取得）
            return Promise.resolve([sampleTestCase]);
          }
          // test_case_projects
          return { where: () => Promise.resolve(links) };
        },
      }),
    } as unknown as DB;

    const newApp = new Hono();
    newApp.route("/api/test-cases", createTestCasesRouter(db));

    const res = await newApp.request("/api/test-cases?project_id=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];

    // 新APIには project_id がない
    expect(body.at(0)).not.toHaveProperty("project_id");
    expect(body.at(0)?.id).toBe(sampleTestCase.id);
  });
});
