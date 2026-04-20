/**
 * Annotation Task / Label CRUD エンドポイントのテスト
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
import { createAnnotationLabelsRouter, createAnnotationTasksRouter } from "./annotation-tasks.js";

// ---- 型定義 ----

type MockTask = {
  id: number;
  name: string;
  description: string | null;
  output_mode: "span_label";
  created_at: number;
  updated_at: number;
};

type MockLabel = {
  id: number;
  annotation_task_id: number;
  key: string;
  name: string;
  color: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
};

// ---- テスト用アプリビルダー ----

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/annotation-tasks", createAnnotationTasksRouter(db as DB));
  app.route("/api/annotation-labels", createAnnotationLabelsRouter(db as DB));
  return app;
}

// ---- テストデータ ----

const sampleTask: MockTask = {
  id: 1,
  name: "テストタスク",
  description: "説明文",
  output_mode: "span_label",
  created_at: 1000000,
  updated_at: 1000000,
};

const sampleLabel: MockLabel = {
  id: 1,
  annotation_task_id: 1,
  key: "bug",
  name: "バグ",
  color: "#ff0000",
  display_order: 0,
  created_at: 1000000,
  updated_at: 1000000,
};

// ---- Task CRUD テスト ----

describe("GET /api/annotation-tasks", () => {
  it("タスク一覧を200で返す", async () => {
    const tasks = [sampleTask, { ...sampleTask, id: 2, name: "別タスク" }];

    const db = {
      select: () => ({
        from: () => ({
          orderBy: () => Promise.resolve(tasks),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-tasks");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockTask[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.name).toBe("テストタスク");
    expect(body.at(1)?.name).toBe("別タスク");
  });

  it("タスクが0件のとき空配列を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          orderBy: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-tasks");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockTask[];
    expect(body).toHaveLength(0);
  });
});

describe("POST /api/annotation-tasks", () => {
  it("バリデーション通過時に201でタスクを返す", async () => {
    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([sampleTask]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "テストタスク", output_mode: "span_label" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockTask;
    expect(body.name).toBe("テストタスク");
    expect(body.output_mode).toBe("span_label");
  });

  it("name が空文字列のとき400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", output_mode: "span_label" }),
    });

    expect(res.status).toBe(400);
  });

  it("output_mode が span_label 以外のとき400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "テストタスク", output_mode: "invalid_mode" }),
    });

    expect(res.status).toBe(400);
  });

  it("output_mode が未指定のとき400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "テストタスク" }),
    });

    expect(res.status).toBe(400);
  });

  it("description 省略時も正常に作成できる", async () => {
    const created = { ...sampleTask, description: null };

    const db = {
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([created]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "テストタスク", output_mode: "span_label" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockTask;
    expect(body.description).toBeNull();
  });
});

describe("GET /api/annotation-tasks/:id", () => {
  it("存在するIDに対して200でタスクとlabelsを返す", async () => {
    const labels = [sampleLabel];

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTask]),
          orderBy: () => Promise.resolve(labels),
        }),
      }),
    };

    // labelsのselect用に追加のwhere/orderByチェーン対応
    let selectCallCount = 0;
    const dbWithLabels = {
      select: () => {
        selectCallCount++;
        const callIndex = selectCallCount;
        return {
          from: () => ({
            where: () => {
              if (callIndex === 1) {
                return Promise.resolve([sampleTask]);
              }
              return {
                orderBy: () => Promise.resolve(labels),
              };
            },
            orderBy: () => Promise.resolve([]),
          }),
        };
      },
    };

    const app = buildApp(dbWithLabels);
    const res = await app.request("/api/annotation-tasks/1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockTask & { labels: MockLabel[] };
    expect(body.id).toBe(1);
    expect(body.name).toBe("テストタスク");
    expect(Array.isArray(body.labels)).toBe(true);
    expect(body.labels).toHaveLength(1);
    expect(body.labels.at(0)?.key).toBe("bug");
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
    const res = await app.request("/api/annotation-tasks/999");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Annotation task not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks/abc");

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/annotation-tasks/:id", () => {
  it("存在するIDに対して200で更新されたタスクを返す", async () => {
    const updated = { ...sampleTask, name: "更新後のタスク", updated_at: 2000000 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTask]),
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
    const res = await app.request("/api/annotation-tasks/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後のタスク" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockTask;
    expect(body.name).toBe("更新後のタスク");
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
    const res = await app.request("/api/annotation-tasks/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Annotation task not found");
  });

  it("name が空文字列のとき400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("数値以外のIDに対して400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/annotation-tasks/:id", () => {
  it("存在するIDに対して204を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleTask]),
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-tasks/1", {
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
    const res = await app.request("/api/annotation-tasks/999", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Annotation task not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks/abc", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
  });
});

// ---- Label CRUD テスト ----

describe("POST /api/annotation-tasks/:id/labels", () => {
  it("バリデーション通過時に201でラベルを返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        const callIndex = selectCallCount;
        return {
          from: () => ({
            where: () => {
              if (callIndex === 1) return Promise.resolve([sampleTask]);
              // 重複チェック: 存在しない
              return Promise.resolve([]);
            },
          }),
        };
      },
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([sampleLabel]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-tasks/1/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "bug", name: "バグ", color: "#ff0000" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MockLabel;
    expect(body.key).toBe("bug");
    expect(body.name).toBe("バグ");
    expect(body.annotation_task_id).toBe(1);
  });

  it("同一task内で key が重複する場合409を返す", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        const callIndex = selectCallCount;
        return {
          from: () => ({
            where: () => {
              if (callIndex === 1) return Promise.resolve([sampleTask]);
              // 重複チェック: 既存ラベルが存在する
              return Promise.resolve([sampleLabel]);
            },
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-tasks/1/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "bug", name: "重複バグ" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Label key already exists in this task");
  });

  it("key が空文字列のとき400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks/1/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "", name: "バグ" }),
    });

    expect(res.status).toBe(400);
  });

  it("name が空文字列のとき400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks/1/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "bug", name: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("存在しないタスクIDに対して404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-tasks/999/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "bug", name: "バグ" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Annotation task not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-tasks/abc/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "bug", name: "バグ" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/annotation-labels/:id", () => {
  it("存在するIDに対して200で更新されたラベルを返す", async () => {
    const updated = { ...sampleLabel, name: "更新後のバグ", updated_at: 2000000 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleLabel]),
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
    const res = await app.request("/api/annotation-labels/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後のバグ" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockLabel;
    expect(body.name).toBe("更新後のバグ");
  });

  it("key 変更時に同一task内で重複する場合409を返す", async () => {
    const labelWithDifferentKey = { ...sampleLabel, id: 2, key: "other" };

    let selectCallCount = 0;
    const db = {
      select: () => {
        selectCallCount++;
        const callIndex = selectCallCount;
        return {
          from: () => ({
            where: () => {
              if (callIndex === 1) return Promise.resolve([labelWithDifferentKey]);
              // 重複チェック: 変更先keyが既存ラベルとぶつかる
              return Promise.resolve([sampleLabel]);
            },
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-labels/2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "bug" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Label key already exists in this task");
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
    const res = await app.request("/api/annotation-labels/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Annotation label not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-labels/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/annotation-labels/:id", () => {
  it("存在するIDに対して204を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleLabel]),
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-labels/1", {
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
    const res = await app.request("/api/annotation-labels/999", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Annotation label not found");
  });

  it("数値以外のIDに対して400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-labels/abc", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
  });
});
