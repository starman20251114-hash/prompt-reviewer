import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { runs, scores } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const MIN_SCORE = 1;
const MAX_SCORE = 100;

const createScoreSchema = z.object({
  human_score: z.number().int().min(MIN_SCORE).max(MAX_SCORE).optional(),
  human_comment: z.string().optional(),
  judge_score: z.number().int().min(MIN_SCORE).max(MAX_SCORE).optional(),
  judge_reason: z.string().optional(),
});

const updateScoreSchema = z.object({
  human_score: z.number().int().min(MIN_SCORE).max(MAX_SCORE).nullable().optional(),
  human_comment: z.string().nullable().optional(),
  judge_score: z.number().int().min(MIN_SCORE).max(MAX_SCORE).nullable().optional(),
  judge_reason: z.string().nullable().optional(),
  is_discarded: z.boolean().optional(),
});

/** 文字列または undefined を整数に変換する。無効・undefined の場合は null を返す */
function parseIntParam(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * スコア CRUD のルーター
 *
 * POST   /api/runs/:runId/score - スコア作成（1 Run に 1 Score）
 * PATCH  /api/runs/:runId/score - スコア更新
 */
export function createScoresRouter(db: DB) {
  const runsRouter = new Hono<{ Variables: Record<string, unknown> }>();

  // POST /api/runs/:runId/score - スコア作成
  // 既存スコアがある場合は 409 Conflict を返す
  runsRouter.post("/:runId/score", zValidator("json", createScoreSchema), async (c) => {
    const runId = parseIntParam(c.req.param("runId"));

    if (runId === null) {
      return c.json({ error: "Invalid runId" }, 400);
    }

    // Run の存在確認
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    // 既存スコアの確認（1 Run につき 1 Score）
    const [existing] = await db.select().from(scores).where(eq(scores.run_id, runId));
    if (existing) {
      return c.json({ error: "Score already exists for this Run" }, 409);
    }

    const body = c.req.valid("json");
    const now = Date.now();

    const result = await db
      .insert(scores)
      .values({
        run_id: runId,
        human_score: body.human_score ?? null,
        human_comment: body.human_comment ?? null,
        judge_score: body.judge_score ?? null,
        judge_reason: body.judge_reason ?? null,
        is_discarded: false,
        created_at: now,
        updated_at: now,
      })
      .returning();

    const created = result[0];
    if (!created) {
      return c.json({ error: "Failed to create Score" }, 500);
    }

    return c.json(created, 201);
  });

  // GET /api/runs/:runId/score - スコア取得
  runsRouter.get("/:runId/score", async (c) => {
    const runId = parseIntParam(c.req.param("runId"));

    if (runId === null) {
      return c.json({ error: "Invalid runId" }, 400);
    }

    const [score] = await db.select().from(scores).where(eq(scores.run_id, runId));
    if (!score) {
      return c.json({ error: "Score not found" }, 404);
    }

    return c.json(score);
  });

  // PATCH /api/runs/:runId/score - スコア更新
  runsRouter.patch("/:runId/score", zValidator("json", updateScoreSchema), async (c) => {
    const runId = parseIntParam(c.req.param("runId"));

    if (runId === null) {
      return c.json({ error: "Invalid runId" }, 400);
    }

    // Run の存在確認
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    // スコアの存在確認
    const [existing] = await db.select().from(scores).where(eq(scores.run_id, runId));
    if (!existing) {
      return c.json({ error: "Score not found for this Run" }, 404);
    }

    const body = c.req.valid("json");
    const updateData: {
      human_score?: number | null;
      human_comment?: string | null;
      judge_score?: number | null;
      judge_reason?: string | null;
      is_discarded?: boolean;
      updated_at: number;
    } = { updated_at: Date.now() };

    if (body.human_score !== undefined) updateData.human_score = body.human_score;
    if (body.human_comment !== undefined) updateData.human_comment = body.human_comment;
    if (body.judge_score !== undefined) updateData.judge_score = body.judge_score;
    if (body.judge_reason !== undefined) updateData.judge_reason = body.judge_reason;
    if (body.is_discarded !== undefined) updateData.is_discarded = body.is_discarded;

    const updateResult = await db
      .update(scores)
      .set(updateData)
      .where(eq(scores.run_id, runId))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update Score" }, 500);
    }

    return c.json(updated);
  });

  return runsRouter;
}
