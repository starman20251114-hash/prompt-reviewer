import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { annotation_labels, annotation_tasks } from "@prompt-reviewer/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const createTaskSchema = z.object({
  name: z.string().min(1, "名前は1文字以上必要です"),
  description: z.string().optional(),
  output_mode: z.literal("span_label"),
});

const updateTaskSchema = z.object({
  name: z.string().min(1, "名前は1文字以上必要です").optional(),
  description: z.string().nullable().optional(),
});

const createLabelSchema = z.object({
  key: z.string().min(1, "keyは1文字以上必要です"),
  name: z.string().min(1, "名前は1文字以上必要です"),
  color: z.string().optional(),
  display_order: z.number().int().optional(),
});

const updateLabelSchema = z.object({
  key: z.string().min(1, "keyは1文字以上必要です").optional(),
  name: z.string().min(1, "名前は1文字以上必要です").optional(),
  color: z.string().nullable().optional(),
  display_order: z.number().int().optional(),
});

export function createAnnotationTasksRouter(db: DB) {
  const router = new Hono();

  // GET /api/annotation-tasks
  router.get("/", async (c) => {
    const result = await db.select().from(annotation_tasks).orderBy(annotation_tasks.id);
    return c.json(result);
  });

  // POST /api/annotation-tasks
  router.post("/", zValidator("json", createTaskSchema), async (c) => {
    const body = c.req.valid("json");
    const now = Date.now();

    const [task] = await db
      .insert(annotation_tasks)
      .values({
        name: body.name,
        description: body.description ?? null,
        output_mode: body.output_mode,
        created_at: now,
        updated_at: now,
      })
      .returning();

    return c.json(task, 201);
  });

  // GET /api/annotation-tasks/:id
  router.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [task] = await db.select().from(annotation_tasks).where(eq(annotation_tasks.id, id));

    if (!task) {
      return c.json({ error: "Annotation task not found" }, 404);
    }

    const labels = await db
      .select()
      .from(annotation_labels)
      .where(eq(annotation_labels.annotation_task_id, id))
      .orderBy(annotation_labels.display_order, annotation_labels.id);

    return c.json({ ...task, labels });
  });

  // PATCH /api/annotation-tasks/:id
  router.patch("/:id", zValidator("json", updateTaskSchema), async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const body = c.req.valid("json");

    const [existing] = await db.select().from(annotation_tasks).where(eq(annotation_tasks.id, id));

    if (!existing) {
      return c.json({ error: "Annotation task not found" }, 404);
    }

    const updateData: {
      name?: string;
      description?: string | null;
      updated_at: number;
    } = { updated_at: Date.now() };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;

    const [updated] = await db
      .update(annotation_tasks)
      .set(updateData)
      .where(eq(annotation_tasks.id, id))
      .returning();

    return c.json(updated);
  });

  // DELETE /api/annotation-tasks/:id
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(annotation_tasks).where(eq(annotation_tasks.id, id));

    if (!existing) {
      return c.json({ error: "Annotation task not found" }, 404);
    }

    await db.delete(annotation_tasks).where(eq(annotation_tasks.id, id));

    return c.body(null, 204);
  });

  // POST /api/annotation-tasks/:id/labels
  router.post("/:id/labels", zValidator("json", createLabelSchema), async (c) => {
    const taskId = Number(c.req.param("id"));

    if (Number.isNaN(taskId)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [task] = await db.select().from(annotation_tasks).where(eq(annotation_tasks.id, taskId));

    if (!task) {
      return c.json({ error: "Annotation task not found" }, 404);
    }

    const body = c.req.valid("json");
    const now = Date.now();

    const [existing] = await db
      .select()
      .from(annotation_labels)
      .where(
        and(eq(annotation_labels.annotation_task_id, taskId), eq(annotation_labels.key, body.key)),
      );

    if (existing) {
      return c.json({ error: "Label key already exists in this task" }, 409);
    }

    const [label] = await db
      .insert(annotation_labels)
      .values({
        annotation_task_id: taskId,
        key: body.key,
        name: body.name,
        color: body.color ?? null,
        display_order: body.display_order ?? 0,
        created_at: now,
        updated_at: now,
      })
      .returning();

    return c.json(label, 201);
  });

  return router;
}

export function createAnnotationLabelsRouter(db: DB) {
  const router = new Hono();

  // PATCH /api/annotation-labels/:id
  router.patch("/:id", zValidator("json", updateLabelSchema), async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(annotation_labels)
      .where(eq(annotation_labels.id, id));

    if (!existing) {
      return c.json({ error: "Annotation label not found" }, 404);
    }

    if (body.key !== undefined && body.key !== existing.key) {
      const [duplicate] = await db
        .select()
        .from(annotation_labels)
        .where(
          and(
            eq(annotation_labels.annotation_task_id, existing.annotation_task_id),
            eq(annotation_labels.key, body.key),
          ),
        );

      if (duplicate) {
        return c.json({ error: "Label key already exists in this task" }, 409);
      }
    }

    const updateData: {
      key?: string;
      name?: string;
      color?: string | null;
      display_order?: number;
      updated_at: number;
    } = { updated_at: Date.now() };

    if (body.key !== undefined) updateData.key = body.key;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;

    const [updated] = await db
      .update(annotation_labels)
      .set(updateData)
      .where(eq(annotation_labels.id, id))
      .returning();

    return c.json(updated);
  });

  // DELETE /api/annotation-labels/:id
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db
      .select()
      .from(annotation_labels)
      .where(eq(annotation_labels.id, id));

    if (!existing) {
      return c.json({ error: "Annotation label not found" }, 404);
    }

    await db.delete(annotation_labels).where(eq(annotation_labels.id, id));

    return c.body(null, 204);
  });

  return router;
}
