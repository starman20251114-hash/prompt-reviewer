import { createHash } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import {
  context_asset_projects,
  context_assets,
  projects,
  prompt_family_context_assets,
  test_case_context_assets,
} from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const createContextAssetSchema = z.object({
  name: z.string().min(1, "nameは1文字以上必要です"),
  path: z.string().min(1, "pathは1文字以上必要です"),
  content: z.string(),
  mime_type: z.string().min(1, "mime_typeは1文字以上必要です"),
});

const updateContextAssetSchema = z
  .object({
    name: z.string().min(1, "nameは1文字以上必要です").optional(),
    path: z.string().min(1, "pathは1文字以上必要です").optional(),
    content: z.string().optional(),
    mime_type: z.string().min(1, "mime_typeは1文字以上必要です").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "更新項目が必要です",
  });

const updateContextAssetProjectsSchema = z.object({
  project_ids: z.array(z.number().int().positive("project_idは正の整数が必要です")),
});

type ContextAssetRecord = typeof context_assets.$inferSelect;

function parseIdParam(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseOptionalInt(value: string | undefined): number | null | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseBooleanQuery(value: string | undefined): boolean | null | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function parseLinkedTo(
  value: string | undefined,
): { type: "test_case"; id: number } | { type: "prompt_family"; id: number } | null | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const [type, rawId] = value.split(":");
  const id = parseOptionalInt(rawId);
  if (id === null || id === undefined) {
    return null;
  }

  if (type === "test_case") {
    return { type: "test_case", id };
  }
  if (type === "prompt_family") {
    return { type: "prompt_family", id };
  }

  return null;
}

function buildContentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function filterByQuery(
  assets: ContextAssetRecord[],
  query: string | undefined,
): ContextAssetRecord[] {
  const normalized = query?.trim().toLocaleLowerCase();
  if (!normalized) {
    return assets;
  }

  return assets.filter((asset) => {
    return (
      asset.name.toLocaleLowerCase().includes(normalized) ||
      asset.path.toLocaleLowerCase().includes(normalized)
    );
  });
}

function filterByIds(assets: ContextAssetRecord[], ids: Set<number>): ContextAssetRecord[] {
  return assets.filter((asset) => ids.has(asset.id));
}

export function createContextAssetsRouter(db: DB) {
  const router = new Hono();

  router.get("/", async (c) => {
    const projectId = parseOptionalInt(c.req.query("project_id"));
    if (projectId === null) {
      return c.json({ error: "Invalid project_id" }, 400);
    }

    const unclassified = parseBooleanQuery(c.req.query("unclassified"));
    if (unclassified === null) {
      return c.json({ error: "Invalid unclassified" }, 400);
    }

    const linkedTo = parseLinkedTo(c.req.query("linked_to"));
    if (linkedTo === null) {
      return c.json({ error: "Invalid linked_to" }, 400);
    }

    let assets = await db.select().from(context_assets);
    assets = filterByQuery(assets, c.req.query("q"));

    if (projectId !== undefined) {
      const links = await db
        .select({ context_asset_id: context_asset_projects.context_asset_id })
        .from(context_asset_projects)
        .where(eq(context_asset_projects.project_id, projectId));
      assets = filterByIds(assets, new Set(links.map((link) => link.context_asset_id)));
    }

    if (unclassified === true) {
      const links = await db
        .select({ context_asset_id: context_asset_projects.context_asset_id })
        .from(context_asset_projects);
      const linkedIds = new Set(links.map((link) => link.context_asset_id));
      assets = assets.filter((asset) => !linkedIds.has(asset.id));
    }

    if (linkedTo !== undefined) {
      const links =
        linkedTo.type === "test_case"
          ? await db
              .select({ context_asset_id: test_case_context_assets.context_asset_id })
              .from(test_case_context_assets)
              .where(eq(test_case_context_assets.test_case_id, linkedTo.id))
          : await db
              .select({ context_asset_id: prompt_family_context_assets.context_asset_id })
              .from(prompt_family_context_assets)
              .where(eq(prompt_family_context_assets.prompt_family_id, linkedTo.id));

      assets = filterByIds(assets, new Set(links.map((link) => link.context_asset_id)));
    }

    assets.sort((a, b) => b.updated_at - a.updated_at || a.id - b.id);
    return c.json(assets);
  });

  router.post("/", zValidator("json", createContextAssetSchema), async (c) => {
    const body = c.req.valid("json");
    const now = Date.now();

    const [created] = await db
      .insert(context_assets)
      .values({
        name: body.name,
        path: body.path,
        content: body.content,
        mime_type: body.mime_type,
        content_hash: buildContentHash(body.content),
        created_at: now,
        updated_at: now,
      })
      .returning();

    if (!created) {
      return c.json({ error: "Failed to create ContextAsset" }, 500);
    }

    return c.json(created, 201);
  });

  router.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [asset] = await db.select().from(context_assets).where(eq(context_assets.id, id));
    if (!asset) {
      return c.json({ error: "ContextAsset not found" }, 404);
    }

    return c.json(asset);
  });

  router.patch("/:id", zValidator("json", updateContextAssetSchema), async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(context_assets).where(eq(context_assets.id, id));
    if (!existing) {
      return c.json({ error: "ContextAsset not found" }, 404);
    }

    const body = c.req.valid("json");
    const nextContent = body.content ?? existing.content;
    const updateData: {
      name?: string;
      path?: string;
      content?: string;
      mime_type?: string;
      content_hash?: string;
      updated_at: number;
    } = {
      updated_at: Date.now(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.path !== undefined) updateData.path = body.path;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.mime_type !== undefined) updateData.mime_type = body.mime_type;
    if (body.content !== undefined) {
      updateData.content_hash = buildContentHash(nextContent);
    }

    const [updated] = await db
      .update(context_assets)
      .set(updateData)
      .where(eq(context_assets.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Failed to update ContextAsset" }, 500);
    }

    return c.json(updated);
  });

  router.delete("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(context_assets).where(eq(context_assets.id, id));
    if (!existing) {
      return c.json({ error: "ContextAsset not found" }, 404);
    }

    await db.delete(context_asset_projects).where(eq(context_asset_projects.context_asset_id, id));
    await db
      .delete(test_case_context_assets)
      .where(eq(test_case_context_assets.context_asset_id, id));
    await db
      .delete(prompt_family_context_assets)
      .where(eq(prompt_family_context_assets.context_asset_id, id));
    await db.delete(context_assets).where(eq(context_assets.id, id));

    return c.body(null, 204);
  });

  router.put("/:id/projects", zValidator("json", updateContextAssetProjectsSchema), async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(context_assets).where(eq(context_assets.id, id));
    if (!existing) {
      return c.json({ error: "ContextAsset not found" }, 404);
    }

    const body = c.req.valid("json");
    const projectIds = [...new Set(body.project_ids)];

    for (const projectId of projectIds) {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        return c.json({ error: "Project not found" }, 404);
      }
    }

    await db.delete(context_asset_projects).where(eq(context_asset_projects.context_asset_id, id));

    for (const projectId of projectIds) {
      await db.insert(context_asset_projects).values({
        context_asset_id: id,
        project_id: projectId,
        created_at: Date.now(),
      });
    }

    return c.json(existing);
  });

  return router;
}
