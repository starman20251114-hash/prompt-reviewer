import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { prompt_families, prompt_versions, runs } from "@prompt-reviewer/core";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const createPromptFamilySchema = z
  .object({
    name: z.string().min(1, "nameは1文字以上必要です").nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "name または description のいずれかが必要です",
  })
  .refine((value) => value.name !== null || value.description !== null, {
    message: "name または description のいずれかが必要です",
  });

const updatePromptFamilySchema = z
  .object({
    name: z.string().min(1, "nameは1文字以上必要です").nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "更新項目が必要です",
  });

type CreatePromptFamilyBody = z.infer<typeof createPromptFamilySchema>;
type UpdatePromptFamilyBody = z.infer<typeof updatePromptFamilySchema>;

function parseIdParam(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function createPromptFamiliesRouter(db: DB) {
  const router = new Hono();

  router.get("/", async (c) => {
    const families = await db
      .select()
      .from(prompt_families)
      .orderBy(desc(prompt_families.created_at));
    return c.json(families);
  });

  router.post("/", zValidator("json", createPromptFamilySchema), async (c) => {
    const body = c.req.valid("json");
    const now = Date.now();

    const [created] = await db
      .insert(prompt_families)
      .values(buildCreateValues(body, now))
      .returning();

    return c.json(created, 201);
  });

  router.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [family] = await db.select().from(prompt_families).where(eq(prompt_families.id, id));
    if (!family) {
      return c.json({ error: "Prompt family not found" }, 404);
    }

    return c.json(family);
  });

  router.patch("/:id", zValidator("json", updatePromptFamilySchema), async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(prompt_families).where(eq(prompt_families.id, id));
    if (!existing) {
      return c.json({ error: "Prompt family not found" }, 404);
    }

    const body = c.req.valid("json");
    const [updated] = await db
      .update(prompt_families)
      .set(buildUpdateValues(body, Date.now()))
      .where(eq(prompt_families.id, id))
      .returning();

    return c.json(updated);
  });

  router.delete("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(prompt_families).where(eq(prompt_families.id, id));
    if (!existing) {
      return c.json({ error: "Prompt family not found" }, 404);
    }

    const versions = await db
      .select({ id: prompt_versions.id })
      .from(prompt_versions)
      .where(eq(prompt_versions.prompt_family_id, id));

    for (const version of versions) {
      const [referencingRun] = await db
        .select({ id: runs.id })
        .from(runs)
        .where(eq(runs.prompt_version_id, version.id));

      if (referencingRun) {
        return c.json({ error: "Prompt family is referenced by runs" }, 409);
      }
    }

    await db.delete(prompt_versions).where(eq(prompt_versions.prompt_family_id, id));
    await db.delete(prompt_families).where(eq(prompt_families.id, id));
    return c.body(null, 204);
  });

  return router;
}

function buildCreateValues(body: CreatePromptFamilyBody, now: number) {
  return {
    name: body.name ?? null,
    description: body.description ?? null,
    created_at: now,
    updated_at: now,
  };
}

function buildUpdateValues(body: UpdatePromptFamilyBody, now: number) {
  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    updated_at: now,
  };
}
