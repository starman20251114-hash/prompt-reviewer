import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { execution_profiles, runs } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  type ExecutionProfileModelClientFactory,
  defaultExecutionProfileModelClientFactory,
  fetchExecutionProfileModels,
  listExecutionProfileModelsSchema,
} from "./execution-profile-models.js";

const createExecutionProfileSchema = z.object({
  name: z.string().min(1, "nameは1文字以上必要です"),
  description: z.string().nullable().optional(),
  model: z.string().min(1, "modelは1文字以上必要です"),
  temperature: z
    .number()
    .min(0, "temperatureは0以上が必要です")
    .max(2, "temperatureは2以下が必要です"),
  api_provider: z.enum(["anthropic", "openai"], {
    error: 'api_providerは "anthropic" または "openai" である必要があります',
  }),
  max_tokens: z
    .number()
    .int("max_tokensは整数が必要です")
    .min(1, "max_tokensは1以上が必要です")
    .nullable()
    .optional(),
});

const updateExecutionProfileSchema = z
  .object({
    name: z.string().min(1, "nameは1文字以上必要です").optional(),
    description: z.string().nullable().optional(),
    model: z.string().min(1, "modelは1文字以上必要です").optional(),
    temperature: z
      .number()
      .min(0, "temperatureは0以上が必要です")
      .max(2, "temperatureは2以下が必要です")
      .optional(),
    api_provider: z
      .enum(["anthropic", "openai"], {
        error: 'api_providerは "anthropic" または "openai" である必要があります',
      })
      .optional(),
    max_tokens: z
      .number()
      .int("max_tokensは整数が必要です")
      .min(1, "max_tokensは1以上が必要です")
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "更新項目が必要です",
  });

type CreateExecutionProfileBody = z.infer<typeof createExecutionProfileSchema>;
type UpdateExecutionProfileBody = z.infer<typeof updateExecutionProfileSchema>;

type ExecutionProfilesRouterOptions = {
  modelClientFactory?: ExecutionProfileModelClientFactory;
};

function parseIdParam(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function createExecutionProfilesRouter(
  db: DB,
  options: ExecutionProfilesRouterOptions = {},
) {
  const router = new Hono();
  const modelClientFactory =
    options.modelClientFactory ?? defaultExecutionProfileModelClientFactory;

  router.get("/", async (c) => {
    const profiles = await db.select().from(execution_profiles).orderBy(execution_profiles.id);
    return c.json(profiles);
  });

  router.post("/", zValidator("json", createExecutionProfileSchema), async (c) => {
    const body = c.req.valid("json");
    const now = Date.now();

    const [created] = await db
      .insert(execution_profiles)
      .values(buildCreateValues(body, now))
      .returning();

    return c.json(created, 201);
  });

  router.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [profile] = await db
      .select()
      .from(execution_profiles)
      .where(eq(execution_profiles.id, id));
    if (!profile) {
      return c.json({ error: "Execution profile not found" }, 404);
    }

    return c.json(profile);
  });

  router.patch("/:id", zValidator("json", updateExecutionProfileSchema), async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db
      .select()
      .from(execution_profiles)
      .where(eq(execution_profiles.id, id));
    if (!existing) {
      return c.json({ error: "Execution profile not found" }, 404);
    }

    const body = c.req.valid("json");
    const [updated] = await db
      .update(execution_profiles)
      .set(buildUpdateValues(body, Date.now()))
      .where(eq(execution_profiles.id, id))
      .returning();

    return c.json(updated);
  });

  router.delete("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db
      .select()
      .from(execution_profiles)
      .where(eq(execution_profiles.id, id));
    if (!existing) {
      return c.json({ error: "Execution profile not found" }, 404);
    }

    await db
      .update(runs)
      .set({ execution_profile_id: null })
      .where(eq(runs.execution_profile_id, id));
    await db.delete(execution_profiles).where(eq(execution_profiles.id, id));
    return c.body(null, 204);
  });

  router.post("/models", zValidator("json", listExecutionProfileModelsSchema), async (c) => {
    const body = c.req.valid("json");
    const result = await fetchExecutionProfileModels(body, modelClientFactory);
    return c.json(result.body, result.status as 200 | 400 | 401 | 501 | 502);
  });

  return router;
}

function buildCreateValues(body: CreateExecutionProfileBody, now: number) {
  return {
    name: body.name,
    description: body.description ?? null,
    model: body.model,
    temperature: body.temperature,
    api_provider: body.api_provider,
    max_tokens: body.max_tokens ?? null,
    created_at: now,
    updated_at: now,
  };
}

function buildUpdateValues(body: UpdateExecutionProfileBody, now: number) {
  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.model !== undefined ? { model: body.model } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.api_provider !== undefined ? { api_provider: body.api_provider } : {}),
    ...(body.max_tokens !== undefined ? { max_tokens: body.max_tokens } : {}),
    updated_at: now,
  };
}
