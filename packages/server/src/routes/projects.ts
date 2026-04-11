import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { projects } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1, "名前は1文字以上必要です"),
  description: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1, "名前は1文字以上必要です").optional(),
  description: z.string().nullable().optional(),
});

export function createProjectsRouter(db: DB) {
  const router = new Hono();

  // GET /api/projects - 全プロジェクト一覧取得
  router.get("/", async (c) => {
    const result = await db.select().from(projects).orderBy(projects.id);
    return c.json(result);
  });

  // POST /api/projects - 新規プロジェクト作成
  router.post("/", zValidator("json", createProjectSchema), async (c) => {
    const body = c.req.valid("json");
    const now = Date.now();

    const [project] = await db
      .insert(projects)
      .values({
        name: body.name,
        description: body.description ?? null,
        created_at: now,
        updated_at: now,
      })
      .returning();

    return c.json(project, 201);
  });

  // GET /api/projects/:id - 特定プロジェクト取得
  router.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, id));

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json(project);
  });

  // PATCH /api/projects/:id - プロジェクト更新
  router.patch("/:id", zValidator("json", updateProjectSchema), async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const body = c.req.valid("json");

    const [existing] = await db.select().from(projects).where(eq(projects.id, id));

    if (!existing) {
      return c.json({ error: "Project not found" }, 404);
    }

    const updateData: { name?: string; description?: string | null; updated_at: number } = {
      updated_at: Date.now(),
    };

    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, id))
      .returning();

    return c.json(updated);
  });

  // DELETE /api/projects/:id - プロジェクト削除
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(projects).where(eq(projects.id, id));

    if (!existing) {
      return c.json({ error: "Project not found" }, 404);
    }

    await db.delete(projects).where(eq(projects.id, id));

    return c.body(null, 204);
  });

  return router;
}
