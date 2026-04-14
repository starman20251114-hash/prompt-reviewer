import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { project_settings } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

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

/** 文字列または undefined を整数に変換する。無効・undefined の場合は null を返す */
function parseIntParam(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * ProjectSettings CRUD エンドポイントのルーター
 *
 * GET /api/projects/:projectId/settings  - 設定取得（存在しなければ404）
 * PUT /api/projects/:projectId/settings  - 設定のupsert（存在しなければ作成、あれば更新）
 */
export function createProjectSettingsRouter(db: DB) {
  const router = new Hono();

  // GET /api/projects/:projectId/settings - 設定取得
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

  // PUT /api/projects/:projectId/settings - 設定のupsert
  // 設定が存在しなければ作成、存在すれば更新する
  router.put("/", zValidator("json", upsertSettingsSchema), async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");
    const now = Date.now();

    // 既存設定の確認
    const [existing] = await db
      .select()
      .from(project_settings)
      .where(eq(project_settings.project_id, projectId));

    if (existing) {
      // 更新
      const updateResult = await db
        .update(project_settings)
        .set({
          model: body.model,
          temperature: body.temperature,
          api_provider: body.api_provider,
          updated_at: now,
        })
        .where(eq(project_settings.project_id, projectId))
        .returning();

      const updated = updateResult[0];
      if (!updated) {
        return c.json({ error: "Failed to update Settings" }, 500);
      }

      return c.json(updated);
    }
    // 新規作成
    const insertResult = await db
      .insert(project_settings)
      .values({
        project_id: projectId,
        model: body.model,
        temperature: body.temperature,
        api_provider: body.api_provider,
        created_at: now,
        updated_at: now,
      })
      .returning();

    const created = insertResult[0];
    if (!created) {
      return c.json({ error: "Failed to create Settings" }, 500);
    }

    return c.json(created, 201);
  });

  return router;
}
