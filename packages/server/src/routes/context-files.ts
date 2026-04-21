import { createHash } from "node:crypto";
import path from "node:path";
import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { context_asset_projects, context_assets } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const createContextFileSchema = z.object({
  file_name: z.string().min(1, "file_nameは1文字以上必要です"),
  content: z.string(),
  mime_type: z.string().optional(),
});

const updateContextFileSchema = z.object({
  content: z.string(),
});

export type ContextFileSummary = {
  name: string;
  path: string;
  mime_type: string;
  size: number;
  updated_at: number;
};

export type ContextFileDetail = ContextFileSummary & {
  content: string;
};

type ContextAssetRecord = typeof context_assets.$inferSelect;

const textMimeTypes: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".py": "text/x-python",
  ".sql": "application/sql",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

function parseProjectId(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function inferMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return textMimeTypes[ext] ?? "text/plain";
}

function sanitizeRelativePath(input: string): string | null {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return null;

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((part) => part === "." || part === "..")) return null;

  return parts.join("/");
}

function buildContentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function toSummary(asset: ContextAssetRecord): ContextFileSummary {
  return {
    name: asset.name,
    path: asset.path,
    mime_type: asset.mime_type,
    size: Buffer.byteLength(asset.content, "utf8"),
    updated_at: asset.updated_at,
  };
}

function toDetail(asset: ContextAssetRecord): ContextFileDetail {
  return {
    ...toSummary(asset),
    content: asset.content,
  };
}

async function listProjectContextAssets(db: DB, projectId: number): Promise<ContextAssetRecord[]> {
  const links = await db
    .select({ context_asset_id: context_asset_projects.context_asset_id })
    .from(context_asset_projects)
    .where(eq(context_asset_projects.project_id, projectId));

  if (links.length === 0) {
    return [];
  }

  const linkedIds = new Set(links.map((link) => link.context_asset_id));
  const assets = await db.select().from(context_assets);

  return assets
    .filter((asset) => linkedIds.has(asset.id))
    .sort((a, b) => a.path.localeCompare(b.path, "ja"));
}

async function findProjectContextAssetByPath(
  db: DB,
  projectId: number,
  safePath: string,
): Promise<ContextAssetRecord | null> {
  const assets = await listProjectContextAssets(db, projectId);
  return assets.find((asset) => asset.path === safePath) ?? null;
}

export function createContextFilesRouter(db: DB) {
  const router = new Hono();

  router.get("/", async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const assets = await listProjectContextAssets(db, projectId);
    return c.json(assets.map(toSummary));
  });

  router.post("/", zValidator("json", createContextFileSchema), async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");
    const safePath = sanitizeRelativePath(body.file_name);
    if (!safePath) {
      return c.json({ error: "Invalid file_name" }, 400);
    }

    const now = Date.now();
    const mimeType = body.mime_type ?? inferMimeType(safePath);
    const existing = await findProjectContextAssetByPath(db, projectId, safePath);

    if (existing) {
      const [updated] = await db
        .update(context_assets)
        .set({
          name: path.basename(safePath),
          path: safePath,
          content: body.content,
          mime_type: mimeType,
          content_hash: buildContentHash(body.content),
          updated_at: now,
        })
        .where(eq(context_assets.id, existing.id))
        .returning();

      if (!updated) {
        return c.json({ error: "Failed to update context file" }, 500);
      }

      return c.json(toSummary(updated), 201);
    }

    const [created] = await db
      .insert(context_assets)
      .values({
        name: path.basename(safePath),
        path: safePath,
        content: body.content,
        mime_type: mimeType,
        content_hash: buildContentHash(body.content),
        created_at: now,
        updated_at: now,
      })
      .returning();

    if (!created) {
      return c.json({ error: "Failed to create context file" }, 500);
    }

    await db.insert(context_asset_projects).values({
      context_asset_id: created.id,
      project_id: projectId,
      created_at: now,
    });

    return c.json(toSummary(created), 201);
  });

  router.get("/content", async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const requestedPath = c.req.query("path");
    if (!requestedPath) {
      return c.json({ error: "Missing path" }, 400);
    }

    const safePath = sanitizeRelativePath(requestedPath);
    if (!safePath) {
      return c.json({ error: "Invalid path" }, 400);
    }

    const asset = await findProjectContextAssetByPath(db, projectId, safePath);
    if (!asset) {
      return c.json({ error: "Context file not found" }, 404);
    }

    return c.json(toDetail(asset));
  });

  router.put("/content", zValidator("json", updateContextFileSchema), async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const requestedPath = c.req.query("path");
    if (!requestedPath) {
      return c.json({ error: "Missing path" }, 400);
    }

    const safePath = sanitizeRelativePath(requestedPath);
    if (!safePath) {
      return c.json({ error: "Invalid path" }, 400);
    }

    const asset = await findProjectContextAssetByPath(db, projectId, safePath);
    if (!asset) {
      return c.json({ error: "Context file not found" }, 404);
    }

    const body = c.req.valid("json");
    const [updated] = await db
      .update(context_assets)
      .set({
        content: body.content,
        content_hash: buildContentHash(body.content),
        updated_at: Date.now(),
      })
      .where(eq(context_assets.id, asset.id))
      .returning();

    if (!updated) {
      return c.json({ error: "Failed to update context file" }, 500);
    }

    return c.json(toDetail(updated));
  });

  return router;
}
