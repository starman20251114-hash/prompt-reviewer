import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { test_cases } from "@prompt-reviewer/core";
import type { Turn } from "@prompt-reviewer/core";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1, "contentは1文字以上必要です"),
});

const createTestCaseSchema = z.object({
  title: z.string().min(1, "タイトルは1文字以上必要です"),
  turns: z.array(turnSchema).min(1, "turnsは1件以上必要です"),
  context_content: z.string().optional(),
  expected_description: z.string().optional(),
  display_order: z.number().int().optional(),
});

const updateTestCaseSchema = z.object({
  title: z.string().min(1, "タイトルは1文字以上必要です").optional(),
  turns: z.array(turnSchema).min(1, "turnsは1件以上必要です").optional(),
  context_content: z.string().optional(),
  expected_description: z.string().nullable().optional(),
  display_order: z.number().int().optional(),
});

export function createTestCasesRouter(db: DB) {
  const router = new Hono();

  // GET /api/projects/:projectId/test-cases - テストケース一覧取得（display_order順）
  router.get("/", async (c) => {
    const projectId = Number(c.req.param("projectId"));

    if (Number.isNaN(projectId)) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const result = await db
      .select()
      .from(test_cases)
      .where(eq(test_cases.project_id, projectId))
      .orderBy(asc(test_cases.display_order), asc(test_cases.id));

    return c.json(
      result.map((tc) => ({
        ...tc,
        turns: JSON.parse(tc.turns) as Turn[],
      })),
    );
  });

  // POST /api/projects/:projectId/test-cases - 新規テストケース作成
  router.post("/", zValidator("json", createTestCaseSchema), async (c) => {
    const projectId = Number(c.req.param("projectId"));

    if (Number.isNaN(projectId)) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");
    const now = Date.now();

    const result = await db
      .insert(test_cases)
      .values({
        project_id: projectId,
        title: body.title,
        turns: JSON.stringify(body.turns),
        context_content: body.context_content ?? "",
        expected_description: body.expected_description ?? null,
        display_order: body.display_order ?? 0,
        created_at: now,
        updated_at: now,
      })
      .returning();

    const testCase = result[0];
    if (!testCase) {
      return c.json({ error: "Failed to create TestCase" }, 500);
    }

    return c.json(
      {
        ...testCase,
        turns: JSON.parse(testCase.turns) as Turn[],
      },
      201,
    );
  });

  // GET /api/projects/:projectId/test-cases/:id - 特定テストケース取得
  router.get("/:id", async (c) => {
    const projectId = Number(c.req.param("projectId"));
    const id = Number(c.req.param("id"));

    if (Number.isNaN(projectId) || Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [testCase] = await db
      .select()
      .from(test_cases)
      .where(and(eq(test_cases.id, id), eq(test_cases.project_id, projectId)));

    if (!testCase) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    return c.json({
      ...testCase,
      turns: JSON.parse(testCase.turns) as Turn[],
    });
  });

  // PATCH /api/projects/:projectId/test-cases/:id - テストケース更新
  router.patch("/:id", zValidator("json", updateTestCaseSchema), async (c) => {
    const projectId = Number(c.req.param("projectId"));
    const id = Number(c.req.param("id"));

    if (Number.isNaN(projectId) || Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db
      .select()
      .from(test_cases)
      .where(and(eq(test_cases.id, id), eq(test_cases.project_id, projectId)));

    if (!existing) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    const body = c.req.valid("json");
    const updateData: {
      title?: string;
      turns?: string;
      context_content?: string;
      expected_description?: string | null;
      display_order?: number;
      updated_at: number;
    } = {
      updated_at: Date.now(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.turns !== undefined) updateData.turns = JSON.stringify(body.turns);
    if (body.context_content !== undefined) updateData.context_content = body.context_content;
    if (body.expected_description !== undefined)
      updateData.expected_description = body.expected_description;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;

    const updateResult = await db
      .update(test_cases)
      .set(updateData)
      .where(and(eq(test_cases.id, id), eq(test_cases.project_id, projectId)))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update TestCase" }, 500);
    }

    return c.json({
      ...updated,
      turns: JSON.parse(updated.turns) as Turn[],
    });
  });

  // DELETE /api/projects/:projectId/test-cases/:id - テストケース削除
  router.delete("/:id", async (c) => {
    const projectId = Number(c.req.param("projectId"));
    const id = Number(c.req.param("id"));

    if (Number.isNaN(projectId) || Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db
      .select()
      .from(test_cases)
      .where(and(eq(test_cases.id, id), eq(test_cases.project_id, projectId)));

    if (!existing) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    await db
      .delete(test_cases)
      .where(and(eq(test_cases.id, id), eq(test_cases.project_id, projectId)));

    return c.body(null, 204);
  });

  return router;
}
