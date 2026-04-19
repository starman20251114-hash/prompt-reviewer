vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createContextAssetsRouter } from "./context-assets.js";

type MockContextAsset = {
  id: number;
  name: string;
  path: string;
  content: string;
  mime_type: string;
  content_hash: string | null;
  created_at: number;
  updated_at: number;
};

type MockContextAssetSummary = Omit<MockContextAsset, "content">;

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/context-assets", createContextAssetsRouter(db as DB));
  return app;
}

const sampleAsset: MockContextAsset = {
  id: 1,
  name: "refund-policy.md",
  path: "policies/refund-policy.md",
  content: "購入から30日以内であれば返金可能です。",
  mime_type: "text/markdown",
  content_hash: "sha256:old",
  created_at: 1000000,
  updated_at: 1000000,
};

const sampleAssetSummary: MockContextAssetSummary = {
  id: 1,
  name: "refund-policy.md",
  path: "policies/refund-policy.md",
  mime_type: "text/markdown",
  content_hash: "sha256:old",
  created_at: 1000000,
  updated_at: 1000000,
};

describe("GET /api/context-assets", () => {
  it("一覧を 200 で返す", async () => {
    const db = {
      select: () => ({
        from: () => Promise.resolve([sampleAsset]),
      }),
    };

    const res = await buildApp(db).request("/api/context-assets");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([sampleAssetSummary]);
  });

  it("一覧レスポンスに content を含めない", async () => {
    const db = {
      select: () => ({
        from: () => Promise.resolve([sampleAsset]),
      }),
    };

    const res = await buildApp(db).request("/api/context-assets");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body[0]).not.toHaveProperty("content");
  });

  it("q で name / path を部分一致検索できる", async () => {
    const assets = [
      sampleAsset,
      {
        ...sampleAsset,
        id: 2,
        name: "shipping-guide.md",
        path: "docs/shipping-guide.md",
      },
    ];
    const db = {
      select: () => ({
        from: () => Promise.resolve(assets),
      }),
    };

    const res = await buildApp(db).request("/api/context-assets?q=refund");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockContextAssetSummary[];
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(1);
  });

  it("project_id でラベル付け済み素材に絞り込める", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([{ context_asset_id: 1 }]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    };

    const app = buildApp({
      ...db,
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => Promise.resolve([sampleAsset, { ...sampleAsset, id: 2 }]),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([{ context_asset_id: 1 }]),
          }),
        };
      },
    });

    const res = await app.request("/api/context-assets?project_id=10");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockContextAssetSummary[];
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(1);
  });

  it("unclassified=true でラベル未設定の素材だけ返す", async () => {
    let selectCallCount = 0;
    const app = buildApp({
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => Promise.resolve([sampleAsset, { ...sampleAsset, id: 2 }]),
          };
        }
        return {
          select: undefined,
          from: () => Promise.resolve([{ context_asset_id: 1 }]),
        };
      },
    });

    const res = await app.request("/api/context-assets?unclassified=true");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockContextAssetSummary[];
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(2);
  });

  it("linked_to=test_case:* で関連素材に絞り込める", async () => {
    let selectCallCount = 0;
    const app = buildApp({
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => Promise.resolve([sampleAsset, { ...sampleAsset, id: 2 }]),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([{ context_asset_id: 2 }]),
          }),
        };
      },
    });

    const res = await app.request("/api/context-assets?linked_to=test_case:12");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockContextAssetSummary[];
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(2);
  });

  it("linked_to=prompt_family:* で関連素材に絞り込める", async () => {
    let selectCallCount = 0;
    const app = buildApp({
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => Promise.resolve([sampleAsset, { ...sampleAsset, id: 2 }]),
          };
        }
        return {
          from: () => ({
            where: () => Promise.resolve([{ context_asset_id: 1 }]),
          }),
        };
      },
    });

    const res = await app.request("/api/context-assets?linked_to=prompt_family:4");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockContextAssetSummary[];
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(1);
  });

  it("不正な project_id は 400 を返す", async () => {
    const res = await buildApp({}).request("/api/context-assets?project_id=abc");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid project_id" });
  });
});

describe("POST /api/context-assets", () => {
  it("新規作成して 201 を返す", async () => {
    const created = { ...sampleAsset };
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

    const res = await buildApp(db).request("/api/context-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sampleAsset.name,
        path: sampleAsset.path,
        content: sampleAsset.content,
        mime_type: sampleAsset.mime_type,
      }),
    });

    expect(res.status).toBe(201);
    expect(capturedValues.name).toBe(sampleAsset.name);
    expect(capturedValues.path).toBe(sampleAsset.path);
    expect(capturedValues.mime_type).toBe(sampleAsset.mime_type);
    expect(typeof capturedValues.content_hash).toBe("string");
  });

  it("name が空なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/context-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        path: sampleAsset.path,
        content: sampleAsset.content,
        mime_type: sampleAsset.mime_type,
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/context-assets/:id", () => {
  it("詳細を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleAsset]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/context-assets/1");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(sampleAsset);
  });

  it("見つからない場合は 404 を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const res = await buildApp(db).request("/api/context-assets/999");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "ContextAsset not found" });
  });
});

describe("PATCH /api/context-assets/:id", () => {
  it("更新して 200 を返す", async () => {
    const updated = { ...sampleAsset, name: "refund-policy-v2.md", updated_at: 2000000 };
    let capturedValues: Record<string, unknown> = {};

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleAsset]),
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

    const res = await buildApp(db).request("/api/context-assets/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "refund-policy-v2.md", content: "更新後本文" }),
    });

    expect(res.status).toBe(200);
    expect(capturedValues.name).toBe("refund-policy-v2.md");
    expect(capturedValues.content).toBe("更新後本文");
    expect(typeof capturedValues.content_hash).toBe("string");
  });

  it("更新項目が空なら 400 を返す", async () => {
    const res = await buildApp({}).request("/api/context-assets/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/context-assets/:id", () => {
  it("関連付けを外してから削除し 204 を返す", async () => {
    let deleteCallCount = 0;

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleAsset]),
        }),
      }),
      delete: () => ({
        where: () => {
          deleteCallCount++;
          return Promise.resolve();
        },
      }),
    };

    const res = await buildApp(db).request("/api/context-assets/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(deleteCallCount).toBe(4);
  });
});

describe("PUT /api/context-assets/:id/projects", () => {
  it("project_ids で関連ラベルを全置換する", async () => {
    let selectCallCount = 0;
    const inserted: Array<{ context_asset_id: number; project_id: number }> = [];
    let deleteCalled = false;

    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleAsset]);
            }
            return Promise.resolve([{ id: 10 }]);
          },
        }),
      }),
      delete: () => ({
        where: () => {
          deleteCalled = true;
          return Promise.resolve();
        },
      }),
      insert: () => ({
        values: (values: { context_asset_id: number; project_id: number }) => {
          inserted.push(values);
          return Promise.resolve();
        },
      }),
    };

    const res = await buildApp(db).request("/api/context-assets/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [10, 10, 11] }),
    });

    expect(res.status).toBe(200);
    expect(deleteCalled).toBe(true);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({ context_asset_id: 1, project_id: 10 });
    expect(inserted[1]).toMatchObject({ context_asset_id: 1, project_id: 11 });
  });

  it("存在しない project を指定すると 404 を返す", async () => {
    let selectCallCount = 0;
    let deleteCalled = false;

    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([sampleAsset]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
      delete: () => ({
        where: () => {
          deleteCalled = true;
          return Promise.resolve();
        },
      }),
    };

    const res = await buildApp(db).request("/api/context-assets/1/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: [999] }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Project not found" });
    expect(deleteCalled).toBe(false);
  });
});
