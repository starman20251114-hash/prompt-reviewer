import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { prompt_versions } from "@prompt-reviewer/core";
import { and, eq, max } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const workflowStepSchema = z.object({
  id: z.string().min(1, "step.idは1文字以上必要です"),
  title: z.string().min(1, "step.titleは1文字以上必要です"),
  prompt: z.string().min(1, "step.promptは1文字以上必要です"),
});

const workflowDefinitionSchema = z.object({
  steps: z.array(workflowStepSchema),
});

const createPromptVersionSchema = z.object({
  content: z.string().min(1, "contentは1文字以上必要です"),
  name: z.string().optional(),
  memo: z.string().optional(),
  workflow_definition: workflowDefinitionSchema.optional(),
});

const updatePromptVersionSchema = z.object({
  content: z.string().min(1, "contentは1文字以上必要です").optional(),
  name: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  workflow_definition: workflowDefinitionSchema.nullable().optional(),
});

const branchPromptVersionSchema = z.object({
  name: z.string().optional(),
  memo: z.string().optional(),
});

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildDefaultPromptName(version: number): string {
  return `プロンプト ${version}`;
}

export function createPromptVersionsRouter(db: DB) {
  const router = new Hono();

  function serializePromptVersion(
    version: typeof prompt_versions.$inferSelect,
  ): Omit<typeof version, "workflow_definition"> & {
    workflow_definition: z.infer<typeof workflowDefinitionSchema> | null;
  } {
    return {
      ...version,
      workflow_definition: version.workflow_definition
        ? (JSON.parse(version.workflow_definition) as z.infer<typeof workflowDefinitionSchema>)
        : null,
    };
  }

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

    return c.json(result.map(serializePromptVersion));
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
    const normalizedName = normalizeOptionalString(body.name) ?? buildDefaultPromptName(nextVersion);

    const result = await db
      .insert(prompt_versions)
      .values({
        project_id: projectId,
        version: nextVersion,
        content: body.content,
        name: normalizedName,
        memo: body.memo ?? null,
        workflow_definition: body.workflow_definition
          ? JSON.stringify(body.workflow_definition)
          : null,
        parent_version_id: null,
        created_at: Date.now(),
      })
      .returning();

    const created = result[0];
    if (!created) {
      return c.json({ error: "Failed to create PromptVersion" }, 500);
    }

    return c.json(serializePromptVersion(created), 201);
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

    return c.json(serializePromptVersion(version));
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
    const normalizedName =
      body.name !== undefined ? normalizeOptionalString(body.name) : undefined;

    const updateData: {
      content?: string;
      name?: string | null;
      memo?: string | null;
      workflow_definition?: string | null;
    } = {};

    if (body.content !== undefined) updateData.content = body.content;
    if (body.name !== undefined) {
      updateData.name =
        existing.parent_version_id === null
          ? normalizedName ?? buildDefaultPromptName(existing.version)
          : normalizedName;
    }
    if (body.memo !== undefined) updateData.memo = body.memo;
    if (body.workflow_definition !== undefined) {
      updateData.workflow_definition = body.workflow_definition
        ? JSON.stringify(body.workflow_definition)
        : null;
    }

    const updateResult = await db
      .update(prompt_versions)
      .set(updateData)
      .where(and(eq(prompt_versions.id, id), eq(prompt_versions.project_id, projectId)))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update PromptVersion" }, 500);
    }

    return c.json(serializePromptVersion(updated));
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
        workflow_definition: parent.workflow_definition,
        parent_version_id: parent.id,
        created_at: Date.now(),
      })
      .returning();

    const created = result[0];
    if (!created) {
      return c.json({ error: "Failed to create branch PromptVersion" }, 500);
    }

    return c.json(serializePromptVersion(created), 201);
  });

  // PATCH /api/projects/:projectId/prompt-versions/:id/selected - Selected フラグ設定
  // プロジェクト内の既存フラグを解除してから対象バージョンに設定（1プロジェクト1件制約）
  router.patch("/:id/selected", async (c) => {
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

    // プロジェクト内の既存 selected フラグを解除
    await db
      .update(prompt_versions)
      .set({ is_selected: false })
      .where(eq(prompt_versions.project_id, projectId));

    // 対象バージョンに selected フラグを設定
    const updateResult = await db
      .update(prompt_versions)
      .set({ is_selected: true })
      .where(and(eq(prompt_versions.id, id), eq(prompt_versions.project_id, projectId)))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update PromptVersion" }, 500);
    }

    return c.json(serializePromptVersion(updated));
  });

  return router;
}
