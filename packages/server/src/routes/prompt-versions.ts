import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { prompt_versions } from "@prompt-reviewer/core";
import { and, eq, max } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const createPromptVersionSchema = z.object({
  content: z.string().min(1, "contentは1文字以上必要です"),
  name: z.string().optional(),
  memo: z.string().optional(),
});

const updatePromptVersionSchema = z.object({
  content: z.string().min(1, "contentは1文字以上必要です").optional(),
  name: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});

const branchPromptVersionSchema = z.object({
  name: z.string().optional(),
  memo: z.string().optional(),
});

export function createPromptVersionsRouter(db: DB) {
  const router = new Hono();

  // GET /api/projects/:projectId/prompt-versions - バージョン一覧取得
  router.get("/", async (c) => {
    const projectId = Number(c.req.param("projectId"));

    if (Number.isNaN(projectId)) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const result = await db
      .select()
      .from(prompt_versions)
      .where(eq(prompt_versions.project_id, projectId));

    return c.json(result);
  });

  // POST /api/projects/:projectId/prompt-versions - 新規バージョン作成
  router.post("/", zValidator("json", createPromptVersionSchema), async (c) => {
    const projectId = Number(c.req.param("projectId"));

    if (Number.isNaN(projectId)) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");

    // version 番号を自動採番（プロジェクト内の最大 version + 1）
    const [maxResult] = await db
      .select({ maxVersion: max(prompt_versions.version) })
      .from(prompt_versions)
      .where(eq(prompt_versions.project_id, projectId));

    const nextVersion = (maxResult?.maxVersion ?? 0) + 1;

    const result = await db
      .insert(prompt_versions)
      .values({
        project_id: projectId,
        version: nextVersion,
        content: body.content,
        name: body.name ?? null,
        memo: body.memo ?? null,
        parent_version_id: null,
        created_at: Date.now(),
      })
      .returning();

    const created = result[0];
    if (!created) {
      return c.json({ error: "Failed to create PromptVersion" }, 500);
    }

    return c.json(created, 201);
  });

  // GET /api/projects/:projectId/prompt-versions/:id - 特定バージョン取得
  router.get("/:id", async (c) => {
    const projectId = Number(c.req.param("projectId"));
    const id = Number(c.req.param("id"));

    if (Number.isNaN(projectId) || Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [version] = await db
      .select()
      .from(prompt_versions)
      .where(and(eq(prompt_versions.id, id), eq(prompt_versions.project_id, projectId)));

    if (!version) {
      return c.json({ error: "PromptVersion not found" }, 404);
    }

    return c.json(version);
  });

  // PATCH /api/projects/:projectId/prompt-versions/:id - バージョン更新
  router.patch("/:id", zValidator("json", updatePromptVersionSchema), async (c) => {
    const projectId = Number(c.req.param("projectId"));
    const id = Number(c.req.param("id"));

    if (Number.isNaN(projectId) || Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db
      .select()
      .from(prompt_versions)
      .where(and(eq(prompt_versions.id, id), eq(prompt_versions.project_id, projectId)));

    if (!existing) {
      return c.json({ error: "PromptVersion not found" }, 404);
    }

    const body = c.req.valid("json");
    const updateData: {
      content?: string;
      name?: string | null;
      memo?: string | null;
    } = {};

    if (body.content !== undefined) updateData.content = body.content;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.memo !== undefined) updateData.memo = body.memo;

    const updateResult = await db
      .update(prompt_versions)
      .set(updateData)
      .where(and(eq(prompt_versions.id, id), eq(prompt_versions.project_id, projectId)))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update PromptVersion" }, 500);
    }

    return c.json(updated);
  });

  // POST /api/projects/:projectId/prompt-versions/:id/branch - 分岐バージョン作成
  router.post("/:id/branch", zValidator("json", branchPromptVersionSchema), async (c) => {
    const projectId = Number(c.req.param("projectId"));
    const id = Number(c.req.param("id"));

    if (Number.isNaN(projectId) || Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [parent] = await db
      .select()
      .from(prompt_versions)
      .where(and(eq(prompt_versions.id, id), eq(prompt_versions.project_id, projectId)));

    if (!parent) {
      return c.json({ error: "PromptVersion not found" }, 404);
    }

    const body = c.req.valid("json");

    // version 番号を自動採番（プロジェクト内の最大 version + 1）
    const [maxResult] = await db
      .select({ maxVersion: max(prompt_versions.version) })
      .from(prompt_versions)
      .where(eq(prompt_versions.project_id, projectId));

    const nextVersion = (maxResult?.maxVersion ?? 0) + 1;

    const result = await db
      .insert(prompt_versions)
      .values({
        project_id: projectId,
        version: nextVersion,
        content: parent.content,
        name: body.name ?? null,
        memo: body.memo ?? null,
        parent_version_id: parent.id,
        created_at: Date.now(),
      })
      .returning();

    const created = result[0];
    if (!created) {
      return c.json({ error: "Failed to create branch PromptVersion" }, 500);
    }

    return c.json(created, 201);
  });

  return router;
}
