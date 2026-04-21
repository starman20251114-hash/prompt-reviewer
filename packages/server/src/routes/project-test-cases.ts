import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import {
  projects,
  test_case_context_assets,
  test_case_projects,
  test_cases,
} from "@prompt-reviewer/core";
import type { Turn } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { hasAnnotationData } from "../lib/annotation-guard.js";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1, "contentは1文字以上必要です"),
});

const createTestCaseSchema = z.object({
  title: z.string().min(1, "タイトルは1文字以上必要です"),
  turns: z.array(turnSchema).default([]),
  context_content: z.string().optional(),
  expected_description: z.string().optional(),
  display_order: z.number().int().optional(),
});

const updateTestCaseSchema = z.object({
  title: z.string().min(1, "タイトルは1文字以上必要です").optional(),
  turns: z.array(turnSchema).optional(),
  context_content: z.string().optional(),
  expected_description: z.string().nullable().optional(),
  display_order: z.number().int().optional(),
});

type TestCaseRecord = typeof test_cases.$inferSelect;
type ParsedTestCase = Omit<TestCaseRecord, "turns"> & {
  turns: Turn[];
  project_id: number;
};

function parseProjectId(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseIdParam(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function serializeTestCase(tc: TestCaseRecord, projectId: number): ParsedTestCase {
  return {
    ...tc,
    turns: JSON.parse(tc.turns) as Turn[],
    project_id: projectId,
  };
}

async function getProjectTestCaseIds(db: DB, projectId: number): Promise<Set<number>> {
  const links = await db
    .select({ test_case_id: test_case_projects.test_case_id })
    .from(test_case_projects)
    .where(eq(test_case_projects.project_id, projectId));
  return new Set(links.map((l) => l.test_case_id));
}

export function createProjectTestCasesRouter(db: DB) {
  const router = new Hono();

  // GET /api/projects/:projectId/test-cases
  router.get("/", async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const linkedIds = await getProjectTestCaseIds(db, projectId);
    if (linkedIds.size === 0) {
      return c.json([]);
    }

    const allCases = await db.select().from(test_cases);
    const filtered = allCases
      .filter((tc) => linkedIds.has(tc.id))
      .sort((a, b) => a.display_order - b.display_order || a.id - b.id);

    return c.json(filtered.map((tc) => serializeTestCase(tc, projectId)));
  });

  // POST /api/projects/:projectId/test-cases
  router.post("/", zValidator("json", createTestCaseSchema), async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = c.req.valid("json");
    const now = Date.now();

    const [testCase] = await db
      .insert(test_cases)
      .values({
        title: body.title,
        turns: JSON.stringify(body.turns),
        context_content: body.context_content ?? "",
        expected_description: body.expected_description ?? null,
        display_order: body.display_order ?? 0,
        created_at: now,
        updated_at: now,
      })
      .returning();

    if (!testCase) {
      return c.json({ error: "Failed to create TestCase" }, 500);
    }

    await db.insert(test_case_projects).values({
      test_case_id: testCase.id,
      project_id: projectId,
      created_at: now,
    });

    return c.json(serializeTestCase(testCase, projectId), 201);
  });

  // GET /api/projects/:projectId/test-cases/:id
  router.get("/:id", async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [testCase] = await db.select().from(test_cases).where(eq(test_cases.id, id));
    if (!testCase) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    const linkedIds = await getProjectTestCaseIds(db, projectId);
    if (!linkedIds.has(id)) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    return c.json(serializeTestCase(testCase, projectId));
  });

  // PATCH /api/projects/:projectId/test-cases/:id
  router.patch("/:id", zValidator("json", updateTestCaseSchema), async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(test_cases).where(eq(test_cases.id, id));
    if (!existing) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    const linkedIds = await getProjectTestCaseIds(db, projectId);
    if (!linkedIds.has(id)) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    const body = c.req.valid("json");

    if (body.context_content !== undefined) {
      const frozen = await hasAnnotationData(db, id);
      if (frozen) {
        return c.json({ error: "annotation済みのtest caseのcontext_contentは更新できません" }, 409);
      }
    }

    const updateData: {
      title?: string;
      turns?: string;
      context_content?: string;
      expected_description?: string | null;
      display_order?: number;
      updated_at: number;
    } = { updated_at: Date.now() };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.turns !== undefined) updateData.turns = JSON.stringify(body.turns);
    if (body.context_content !== undefined) updateData.context_content = body.context_content;
    if (body.expected_description !== undefined)
      updateData.expected_description = body.expected_description;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;

    const [updated] = await db
      .update(test_cases)
      .set(updateData)
      .where(eq(test_cases.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Failed to update TestCase" }, 500);
    }

    return c.json(serializeTestCase(updated, projectId));
  });

  // DELETE /api/projects/:projectId/test-cases/:id
  router.delete("/:id", async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(test_cases).where(eq(test_cases.id, id));
    if (!existing) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    const linkedIds = await getProjectTestCaseIds(db, projectId);
    if (!linkedIds.has(id)) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    await db.delete(test_case_projects).where(eq(test_case_projects.test_case_id, id));
    await db.delete(test_case_context_assets).where(eq(test_case_context_assets.test_case_id, id));
    await db.delete(test_cases).where(eq(test_cases.id, id));

    return c.body(null, 204);
  });

  return router;
}
