import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { runs } from "@prompt-reviewer/core";
import type { ConversationMessage } from "@prompt-reviewer/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1, "contentは1文字以上必要です"),
});

const createRunSchema = z.object({
  prompt_version_id: z.number().int().positive("prompt_version_idは正の整数が必要です"),
  test_case_id: z.number().int().positive("test_case_idは正の整数が必要です"),
  conversation: z.array(conversationMessageSchema).min(1, "conversationは1件以上必要です"),
  model: z.string().min(1, "modelは1文字以上必要です"),
  temperature: z.number().min(0).max(2),
  api_provider: z.string().min(1, "api_providerは1文字以上必要です"),
});

/** 文字列または undefined を整数に変換する。無効・undefined の場合は null を返す */
function parseIntParam(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** JSON 文字列を ConversationMessage[] に変換する */
function parseConversation(json: string): ConversationMessage[] {
  return JSON.parse(json) as ConversationMessage[];
}

export function createRunsRouter(db: DB) {
  const router = new Hono();

  // GET /api/projects/:projectId/runs - Run一覧取得（prompt_version_id / test_case_id でフィルタ可能）
  router.get("/", async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const promptVersionIdParam = c.req.query("prompt_version_id");
    const testCaseIdParam = c.req.query("test_case_id");

    const conditions = [eq(runs.project_id, projectId)];

    if (promptVersionIdParam !== undefined) {
      const promptVersionId = parseIntParam(promptVersionIdParam);
      if (promptVersionId === null) {
        return c.json({ error: "Invalid prompt_version_id" }, 400);
      }
      conditions.push(eq(runs.prompt_version_id, promptVersionId));
    }

    if (testCaseIdParam !== undefined) {
      const testCaseId = parseIntParam(testCaseIdParam);
      if (testCaseId === null) {
        return c.json({ error: "Invalid test_case_id" }, 400);
      }
      conditions.push(eq(runs.test_case_id, testCaseId));
    }

    const result = await db
      .select()
      .from(runs)
      .where(and(...conditions));

    return c.json(
      result.map((run) => ({
        ...run,
        conversation: parseConversation(run.conversation),
      })),
    );
  });

  // POST /api/projects/:projectId/runs - 新規Run作成
  router.post("/", zValidator("json", createRunSchema), async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");

    const result = await db
      .insert(runs)
      .values({
        project_id: projectId,
        prompt_version_id: body.prompt_version_id,
        test_case_id: body.test_case_id,
        conversation: JSON.stringify(body.conversation),
        is_best: 0,
        model: body.model,
        temperature: body.temperature,
        api_provider: body.api_provider,
        created_at: Date.now(),
      })
      .returning();

    const created = result[0];
    if (!created) {
      return c.json({ error: "Failed to create Run" }, 500);
    }

    return c.json(
      {
        ...created,
        conversation: parseConversation(created.conversation),
      },
      201,
    );
  });

  // GET /api/projects/:projectId/runs/:id - 特定Run取得
  router.get("/:id", async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));
    const id = parseIntParam(c.req.param("id"));

    if (projectId === null || id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.project_id, projectId)));

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return c.json({
      ...run,
      conversation: parseConversation(run.conversation),
    });
  });

  // PATCH /api/projects/:projectId/runs/:id/best - ベスト回答フラグ更新
  // バージョン×テストケースごとに1件のみ設定できる（既存フラグは自動解除）
  router.patch("/:id/best", async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));
    const id = parseIntParam(c.req.param("id"));

    if (projectId === null || id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.project_id, projectId)));

    if (!existing) {
      return c.json({ error: "Run not found" }, 404);
    }

    // 同一 prompt_version_id × test_case_id の既存フラグを解除
    await db
      .update(runs)
      .set({ is_best: 0 })
      .where(
        and(
          eq(runs.project_id, projectId),
          eq(runs.prompt_version_id, existing.prompt_version_id),
          eq(runs.test_case_id, existing.test_case_id),
        ),
      );

    // 対象Runにベスト回答フラグを設定
    const updateResult = await db
      .update(runs)
      .set({ is_best: 1 })
      .where(and(eq(runs.id, id), eq(runs.project_id, projectId)))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update Run" }, 500);
    }

    return c.json({
      ...updated,
      conversation: parseConversation(updated.conversation),
    });
  });

  return router;
}
