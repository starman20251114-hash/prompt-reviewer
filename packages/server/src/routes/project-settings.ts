import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { execution_profiles, project_settings } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  type ExecutionProfileModelClientFactory,
  defaultExecutionProfileModelClientFactory,
  fetchExecutionProfileModels,
  listExecutionProfileModelsSchema,
} from "./execution-profile-models.js";

const upsertSettingsSchema = z.object({
  model: z.string().min(1, "modelは1文字以上必要です"),
  temperature: z
    .number()
    .min(0, "temperatureは0以上が必要です")
    .max(2, "temperatureは2以下が必要です"),
  api_provider: z.enum(["anthropic", "openai"], {
    error: 'api_providerは "anthropic" または "openai" である必要があります',
  }),
});

type UpsertBody = z.infer<typeof upsertSettingsSchema>;

type ProjectSettingsRouterOptions = {
  modelClientFactory?: ExecutionProfileModelClientFactory;
};

type ProjectSettingsWriteTx = Pick<DB, "insert" | "update">;

function parseIntParam(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * project ごとの既定 execution_profile を識別する name
 * 命名規則: "project-{projectId}-default"
 */
function defaultProfileName(projectId: number): string {
  return `project-${projectId}-default`;
}

function upsertDefaultExecutionProfile(
  tx: ProjectSettingsWriteTx,
  projectId: number,
  body: UpsertBody,
  now: number,
) {
  tx.insert(execution_profiles)
    .values({
      name: defaultProfileName(projectId),
      description: null,
      model: body.model,
      temperature: body.temperature,
      api_provider: body.api_provider,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: execution_profiles.name,
      set: {
        model: body.model,
        temperature: body.temperature,
        api_provider: body.api_provider,
        updated_at: now,
      },
    })
    .run();
}

/**
 * ProjectSettings エンドポイントのルーター（互換レイヤ）
 *
 * GET  /api/projects/:projectId/settings  - 設定取得（project_settings テーブルを参照）
 * PUT  /api/projects/:projectId/settings  - 設定の upsert
 *   - project_settings テーブルを更新（旧 UI との互換維持）
 *   - execution_profiles テーブルにも同期（新テーブルへの書き込み）
 *   - 両テーブルへの書き込みはトランザクションで保護し、片方の失敗で不整合が生じないようにする
 */
export function createProjectSettingsRouter(db: DB, options: ProjectSettingsRouterOptions = {}) {
  const router = new Hono();
  const modelClientFactory =
    options.modelClientFactory ?? defaultExecutionProfileModelClientFactory;

  router.get("/", async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const [settings] = await db
      .select()
      .from(project_settings)
      .where(eq(project_settings.project_id, projectId));

    if (!settings) {
      return c.json({ error: "Settings not found" }, 404);
    }

    return c.json(settings);
  });

  router.put("/", zValidator("json", upsertSettingsSchema), async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");
    const now = Date.now();

    const [existing] = await db
      .select()
      .from(project_settings)
      .where(eq(project_settings.project_id, projectId));

    if (existing) {
      const updated = db.transaction((tx) => {
        upsertDefaultExecutionProfile(tx, projectId, body, now);

        const results = tx
          .update(project_settings)
          .set({
            model: body.model,
            temperature: body.temperature,
            api_provider: body.api_provider,
            updated_at: now,
          })
          .where(eq(project_settings.project_id, projectId))
          .returning()
          .all();
        return results[0] ?? null;
      });

      if (!updated) return c.json({ error: "Failed to update Settings" }, 500);
      return c.json(updated);
    }

    const created = db.transaction((tx) => {
      upsertDefaultExecutionProfile(tx, projectId, body, now);

      const results = tx
        .insert(project_settings)
        .values({
          project_id: projectId,
          model: body.model,
          temperature: body.temperature,
          api_provider: body.api_provider,
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: project_settings.project_id,
          set: {
            model: body.model,
            temperature: body.temperature,
            api_provider: body.api_provider,
            updated_at: now,
          },
        })
        .returning()
        .all();
      return results[0] ?? null;
    });

    if (!created) return c.json({ error: "Failed to create Settings" }, 500);
    return c.json(created, 201);
  });

  router.post("/models", zValidator("json", listExecutionProfileModelsSchema), async (c) => {
    const body = c.req.valid("json");
    const result = await fetchExecutionProfileModels(body, modelClientFactory);
    return c.json(result.body, result.status as 200 | 400 | 401 | 501 | 502);
  });

  return router;
}
