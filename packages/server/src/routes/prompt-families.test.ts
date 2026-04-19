vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createPromptFamiliesRouter } from "./prompt-families.js";

type MockPromptFamily = {
  id: number;
  name: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
};

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/prompt-families", createPromptFamiliesRouter(db as DB));
  return app;
}

const sampleFamily: MockPromptFamily = {
  id: 1,
  name: "顧客対応系列",
  description: "顧客サポート向けプロンプトの系列",
  created_at: 1000000,
  updated_at: 1000000,
};

describe("GET /api/prompt-families", () => {
  it("createdAt降順で一覧を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          orderBy: () => Promise.resolve([sampleFamily]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/prompt-families");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([sampleFamily]);
  });
});

describe("POST /api/prompt-families", () => {
  it("新規作成して 201 を返す", async () => {
    const created: MockPromptFamily = {
      id: 2,
      name: "新しい系列",
      description: null,
      created_at: 2000000,
      updated_at: 2000000,
    };
    let capturedValues: Record<string, unknown> = {};

    const db = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          capturedValues = values;
          return {
            returning: () => Promise.resolve([created]),
          };
        },
      }),
    };

    const res = await buildApp(db).request("/api/prompt-families", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "新しい系列",
        description: null,
      }),
    });

    expect(res.status).toBe(201);
    expect(capturedValues.name).toBe("新しい系列");
    expect(capturedValues.description).toBeNull();
    expect(typeof capturedValues.created_at).toBe("number");
    expect(typeof capturedValues.updated_at).toBe("number");
    await expect(res.json()).resolves.toEqual(created);
  });

  it("name と description が未指定なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/prompt-families", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("name が空文字なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/prompt-families", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("name と description がともに null なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/prompt-families", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: null, description: null }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/prompt-families/:id", () => {
  it("詳細を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleFamily]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/prompt-families/1");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(sampleFamily);
  });

  it("見つからない場合は 404 を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/prompt-families/999");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Prompt family not found" });
  });

  it("数値以外の ID なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/prompt-families/abc");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid ID" });
  });
});

describe("PATCH /api/prompt-families/:id", () => {
  it("更新して 200 を返す", async () => {
    const updated: MockPromptFamily = {
      ...sampleFamily,
      name: "更新後の系列名",
      updated_at: 2000000,
    };
    let capturedValues: Record<string, unknown> = {};

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleFamily]),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          capturedValues = values;
          return {
            where: () => ({
              returning: () => Promise.resolve([updated]),
            }),
          };
        },
      }),
    };

    const res = await buildApp(db).request("/api/prompt-families/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後の系列名" }),
    });

    expect(res.status).toBe(200);
    expect(capturedValues.name).toBe("更新後の系列名");
    expect(typeof capturedValues.updated_at).toBe("number");
    await expect(res.json()).resolves.toEqual(updated);
  });

  it("対象が存在しない場合は 404 を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/prompt-families/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "新しい名前" }),
    });

    expect(res.status).toBe(404);
  });

  it("更新項目が空なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/prompt-families/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("数値以外の ID なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/prompt-families/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid ID" });
  });
});

describe("DELETE /api/prompt-families/:id", () => {
  it("関連する prompt_versions の参照を外してから削除し 204 を返す", async () => {
    let clearedPromptFamilyId: number | undefined;
    let deleteCalled = false;

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleFamily]),
        }),
      }),
      update: (target: unknown) => ({
        set: (values: Record<string, unknown>) => {
          expect(target).toBeDefined();
          expect(values).toEqual({ prompt_family_id: null });
          return {
            where: (_condition: unknown) => {
              clearedPromptFamilyId = sampleFamily.id;
              return Promise.resolve();
            },
          };
        },
      }),
      delete: () => ({
        where: () => {
          deleteCalled = true;
          return Promise.resolve();
        },
      }),
    };

    const res = await buildApp(db).request("/api/prompt-families/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(clearedPromptFamilyId).toBe(sampleFamily.id);
    expect(deleteCalled).toBe(true);
  });

  it("見つからない場合は 404 を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/prompt-families/999", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Prompt family not found" });
  });

  it("数値以外の ID なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/prompt-families/abc", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid ID" });
  });
});
