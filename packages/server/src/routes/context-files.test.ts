vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createContextFilesRouter } from "./context-files.js";

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

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/projects/:projectId/context-files", createContextFilesRouter(db as DB));
  return app;
}

const sampleAsset: MockContextAsset = {
  id: 1,
  name: "guide.md",
  path: "docs/guide.md",
  content: "# guide",
  mime_type: "text/markdown",
  content_hash: "sha256:guide",
  created_at: 1000000,
  updated_at: 1000100,
};

describe("context files router", () => {
  it("GET /api/projects/:projectId/context-files は project ラベル付き素材だけ返す", async () => {
    let selectCallCount = 0;
    const app = buildApp({
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ context_asset_id: 1 }]),
            }),
          };
        }

        return {
          from: () =>
            Promise.resolve([
              sampleAsset,
              {
                ...sampleAsset,
                id: 2,
                name: "other.md",
                path: "docs/other.md",
              },
            ]),
        };
      },
    });

    const res = await app.request("/api/projects/12/context-files");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      {
        name: "guide.md",
        path: "docs/guide.md",
        mime_type: "text/markdown",
        size: Buffer.byteLength("# guide", "utf8"),
        updated_at: 1000100,
      },
    ]);
  });

  it("POST /api/projects/:projectId/context-files は context asset を作成して project に紐付ける", async () => {
    const created = {
      ...sampleAsset,
      id: 10,
      name: "policy.txt",
      path: "snapshots/policy.txt",
      content: "refund within 30 days",
      mime_type: "text/plain",
    };
    let insertCallCount = 0;
    let capturedAssetValues: Record<string, unknown> = {};
    let capturedLinkValues: Record<string, unknown> = {};

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
      insert: () => {
        insertCallCount++;
        if (insertCallCount === 1) {
          return {
            values: (values: Record<string, unknown>) => {
              capturedAssetValues = values;
              return {
                returning: () => Promise.resolve([created]),
              };
            },
          };
        }

        return {
          values: (values: Record<string, unknown>) => {
            capturedLinkValues = values;
            return Promise.resolve();
          },
        };
      },
    };

    const res = await buildApp(db).request("/api/projects/3/context-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: "snapshots/policy.txt",
        content: "refund within 30 days",
      }),
    });

    expect(res.status).toBe(201);
    expect(capturedAssetValues.name).toBe("policy.txt");
    expect(capturedAssetValues.path).toBe("snapshots/policy.txt");
    expect(capturedAssetValues.mime_type).toBe("text/plain");
    expect(typeof capturedAssetValues.content_hash).toBe("string");
    expect(capturedLinkValues.context_asset_id).toBe(10);
    expect(capturedLinkValues.project_id).toBe(3);
  });

  it("同じ path を再投稿した場合は新規作成せず既存 asset を更新する", async () => {
    let selectCallCount = 0;
    let updateCalled = false;
    let insertCalled = false;
    let capturedUpdateValues: Record<string, unknown> = {};
    const updated = {
      ...sampleAsset,
      content: "updated content",
      updated_at: 2000000,
    };

    const app = buildApp({
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ context_asset_id: 1 }]),
            }),
          };
        }

        return {
          from: () => Promise.resolve([sampleAsset]),
        };
      },
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updateCalled = true;
          capturedUpdateValues = values;
          return {
            where: () => ({
              returning: () => Promise.resolve([updated]),
            }),
          };
        },
      }),
      insert: () => {
        insertCalled = true;
        return {
          values: () => Promise.resolve(),
        };
      },
    });

    const res = await app.request("/api/projects/3/context-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: "docs/guide.md",
        content: "updated content",
      }),
    });

    expect(res.status).toBe(201);
    expect(updateCalled).toBe(true);
    expect(insertCalled).toBe(false);
    expect(capturedUpdateValues.content).toBe("updated content");
    expect(capturedUpdateValues.path).toBe("docs/guide.md");
    expect(capturedUpdateValues.name).toBe("guide.md");
    expect(capturedUpdateValues.mime_type).toBe("text/markdown");
  });

  it("GET /content は project に紐付いた同一 path の素材を返す", async () => {
    let selectCallCount = 0;
    const app = buildApp({
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ context_asset_id: 2 }]),
            }),
          };
        }

        return {
          from: () =>
            Promise.resolve([
              sampleAsset,
              {
                ...sampleAsset,
                id: 2,
                content: "project specific",
              },
            ]),
        };
      },
    });

    const res = await app.request("/api/projects/7/context-files/content?path=docs/guide.md");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      name: "guide.md",
      path: "docs/guide.md",
      mime_type: "text/markdown",
      size: Buffer.byteLength("project specific", "utf8"),
      updated_at: 1000100,
      content: "project specific",
    });
  });

  it("PUT /content は path から解決した asset を更新する", async () => {
    let selectCallCount = 0;
    let capturedUpdateValues: Record<string, unknown> = {};
    const updated = {
      ...sampleAsset,
      id: 2,
      content: "after",
      updated_at: 2000000,
    };

    const app = buildApp({
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ context_asset_id: 2 }]),
            }),
          };
        }

        return {
          from: () =>
            Promise.resolve([
              sampleAsset,
              {
                ...sampleAsset,
                id: 2,
                content: "before",
              },
            ]),
        };
      },
      update: () => ({
        set: (values: Record<string, unknown>) => {
          capturedUpdateValues = values;
          return {
            where: () => ({
              returning: () => Promise.resolve([updated]),
            }),
          };
        },
      }),
    });

    const res = await app.request("/api/projects/9/context-files/content?path=docs/guide.md", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "after" }),
    });

    expect(res.status).toBe(200);
    expect(capturedUpdateValues.content).toBe("after");
    expect(typeof capturedUpdateValues.content_hash).toBe("string");
    const body = (await res.json()) as { content: string };
    expect(body.content).toBe("after");
  });

  it("project フィルタ外の素材は一覧に含めない", async () => {
    let selectCallCount = 0;
    const app = buildApp({
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ context_asset_id: 2 }]),
            }),
          };
        }

        return {
          from: () =>
            Promise.resolve([
              sampleAsset,
              {
                ...sampleAsset,
                id: 2,
                name: "selected.md",
                path: "docs/selected.md",
              },
            ]),
        };
      },
    });

    const res = await app.request("/api/projects/4/context-files");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      {
        name: "selected.md",
        path: "docs/selected.md",
        mime_type: "text/markdown",
        size: Buffer.byteLength("# guide", "utf8"),
        updated_at: 1000100,
      },
    ]);
  });

  it("不正な path を拒否する", async () => {
    const app = buildApp({});

    const res = await app.request("/api/projects/4/context-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: "../escape.txt",
        content: "bad",
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid file_name" });
  });

  it("GET /content の不正な path は 400 を返す", async () => {
    const app = buildApp({});

    const res = await app.request("/api/projects/4/context-files/content?path=../escape.txt");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid path" });
  });
});
