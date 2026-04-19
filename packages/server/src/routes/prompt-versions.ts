import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { prompt_versions } from "@prompt-reviewer/core";
import { and, eq, max } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const workflowStepIdPattern = /^[A-Za-z0-9_-]+$/;
const reservedWorkflowStepIds = new Set(["__base_prompt__"]);

const workflowStepSchema = z.object({
  id: z
    .string()
    .min(1, "step.idは1文字以上必要です")
    .regex(workflowStepIdPattern, "step.idは半角英数字、_、- のみ使用できます"),
  title: z.string().min(1, "step.titleは1文字以上必要です"),
  prompt: z.string().min(1, "step.promptは1文字以上必要です"),
});

const workflowDefinitionSchema = z
  .object({
    steps: z.array(workflowStepSchema),
  })
  .superRefine((value, ctx) => {
    const seenIds = new Set<string>();

    value.steps.forEach((step, index) => {
      if (reservedWorkflowStepIds.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "step.idに __base_prompt__ は使用できません",
          path: ["steps", index, "id"],
        });
      }

      if (seenIds.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "step.idは重複できません",
          path: ["steps", index, "id"],
        });
        return;
      }

      seenIds.add(step.id);
    });
  });

const createPromptVersionSchema = z.object({
  prompt_family_id: z.number().int().positive("prompt_family_idは正の整数が必要です"),
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

const updateProjectLinkSchema = z.object({
  project_id: z.number().int().positive("project_idは正の整数が必要です").nullable(),
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

  function serializePromptVersion(version: typeof prompt_versions.$inferSelect): Omit<
    typeof version,
    "workflow_definition"
  > & {
    workflow_definition: z.infer<typeof workflowDefinitionSchema> | null;
  } {
    return {
      ...version,
      workflow_definition: version.workflow_definition
        ? (JSON.parse(version.workflow_definition) as z.infer<typeof workflowDefinitionSchema>)
        : null,
    };
  }

  // GET /api/prompt-versions?prompt_family_id=N - family単位でバージョン一覧取得
  router.get("/", async (c) => {
    const familyIdParam = c.req.query("prompt_family_id");
    if (!familyIdParam) {
      return c.json({ error: "prompt_family_id is required" }, 400);
    }

    const familyId = Number(familyIdParam);
    if (Number.isNaN(familyId)) {
      return c.json({ error: "Invalid prompt_family_id" }, 400);
    }

    const result = await db
      .select()
      .from(prompt_versions)
      .where(eq(prompt_versions.prompt_family_id, familyId));

    return c.json(result.map(serializePromptVersion));
  });

  // POST /api/prompt-versions - prompt_family_id ベースで新規バージョン作成
  router.post("/", zValidator("json", createPromptVersionSchema), async (c) => {
    const body = c.req.valid("json");
    const { prompt_family_id } = body;

    const [maxResult] = await db
      .select({ maxVersion: max(prompt_versions.version) })
      .from(prompt_versions)
      .where(eq(prompt_versions.prompt_family_id, prompt_family_id));

    const nextVersion = (maxResult?.maxVersion ?? 0) + 1;
    const normalizedName =
      normalizeOptionalString(body.name) ?? buildDefaultPromptName(nextVersion);

    const result = await db
      .insert(prompt_versions)
      .values({
        prompt_family_id,
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

  // GET /api/prompt-versions/:id - 単件取得
  router.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [version] = await db.select().from(prompt_versions).where(eq(prompt_versions.id, id));

    if (!version) {
      return c.json({ error: "PromptVersion not found" }, 404);
    }

    return c.json(serializePromptVersion(version));
  });

  // PATCH /api/prompt-versions/:id - 部分更新
  router.patch("/:id", zValidator("json", updatePromptVersionSchema), async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(prompt_versions).where(eq(prompt_versions.id, id));

    if (!existing) {
      return c.json({ error: "PromptVersion not found" }, 404);
    }

    const body = c.req.valid("json");

    const updateData: {
      content?: string;
      name?: string | null;
      memo?: string | null;
      workflow_definition?: string | null;
    } = {};

    if (body.content !== undefined) updateData.content = body.content;
    if (body.name !== undefined) {
      const normalizedName = normalizeOptionalString(body.name);
      updateData.name =
        existing.parent_version_id === null
          ? (normalizedName ?? buildDefaultPromptName(existing.version))
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
      .where(eq(prompt_versions.id, id))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update PromptVersion" }, 500);
    }

    return c.json(serializePromptVersion(updated));
  });

  // POST /api/prompt-versions/:id/branch - 分岐バージョン作成
  router.post("/:id/branch", zValidator("json", branchPromptVersionSchema), async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [parent] = await db.select().from(prompt_versions).where(eq(prompt_versions.id, id));

    if (!parent) {
      return c.json({ error: "PromptVersion not found" }, 404);
    }

    const body = c.req.valid("json");

    const [maxResult] = await db
      .select({ maxVersion: max(prompt_versions.version) })
      .from(prompt_versions)
      .where(eq(prompt_versions.prompt_family_id, parent.prompt_family_id));

    const nextVersion = (maxResult?.maxVersion ?? 0) + 1;

    const result = await db
      .insert(prompt_versions)
      .values({
        prompt_family_id: parent.prompt_family_id,
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

  // PATCH /api/prompt-versions/:id/selected - family内で選択切り替え（1family1件制約）
  router.patch("/:id/selected", async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(prompt_versions).where(eq(prompt_versions.id, id));

    if (!existing) {
      return c.json({ error: "PromptVersion not found" }, 404);
    }

    await db
      .update(prompt_versions)
      .set({ is_selected: false })
      .where(eq(prompt_versions.prompt_family_id, existing.prompt_family_id));

    const updateResult = await db
      .update(prompt_versions)
      .set({ is_selected: true })
      .where(eq(prompt_versions.id, id))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update PromptVersion" }, 500);
    }

    return c.json(serializePromptVersion(updated));
  });

  // PUT /api/prompt-versions/:id/projects - プロジェクト紐付け更新
  router.put("/:id/projects", zValidator("json", updateProjectLinkSchema), async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(prompt_versions).where(eq(prompt_versions.id, id));

    if (!existing) {
      return c.json({ error: "PromptVersion not found" }, 404);
    }

    const body = c.req.valid("json");

    const updateResult = await db
      .update(prompt_versions)
      .set({ project_id: body.project_id })
      .where(eq(prompt_versions.id, id))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update PromptVersion" }, 500);
    }

    return c.json(serializePromptVersion(updated));
  });

  return router;
}
