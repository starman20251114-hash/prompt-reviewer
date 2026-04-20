import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import {
  context_assets,
  projects,
  test_case_context_assets,
  test_case_projects,
  test_cases,
} from "@prompt-reviewer/core";
import type { Turn } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

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

const updateTestCaseProjectsSchema = z.object({
  project_ids: z.array(z.number().int().positive("project_idは正の整数が必要です")),
});

const updateTestCaseContextAssetsSchema = z.object({
  context_asset_ids: z.array(z.number().int().positive("context_asset_idは正の整数が必要です")),
});

function parseIdParam(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseOptionalInt(value: string | undefined): number | null | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseBooleanQuery(value: string | undefined): boolean | null | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

type TestCaseRecord = typeof test_cases.$inferSelect;
type ParsedTestCase = Omit<TestCaseRecord, "turns"> & { turns: Turn[] };

function parseTurns(raw: string): Turn[] {
  return JSON.parse(raw) as Turn[];
}

function serializeTestCase(tc: TestCaseRecord): ParsedTestCase {
  return {
    ...tc,
    turns: parseTurns(tc.turns),
  };
}

export function createTestCasesRouter(db: DB) {
  const router = new Hono();

  // GET /api/test-cases - テストケース一覧取得
  // クエリパラメータ: project_id / unclassified / q
  router.get("/", async (c) => {
    const projectId = parseOptionalInt(c.req.query("project_id"));
    if (projectId === null) {
      return c.json({ error: "Invalid project_id" }, 400);
    }

    const unclassified = parseBooleanQuery(c.req.query("unclassified"));
    if (unclassified === null) {
      return c.json({ error: "Invalid unclassified" }, 400);
    }

    const q = c.req.query("q")?.trim();

    // 全テストケースを取得
    let allCases = await db.select().from(test_cases);

    // qフィルタ（タイトル部分一致）
    if (q) {
      allCases = allCases.filter((tc) =>
        tc.title.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
      );
    }

    // project_idフィルタ: 指定プロジェクトに紐づくテストケースのみ
    if (projectId !== undefined) {
      const links = await db
        .select({ test_case_id: test_case_projects.test_case_id })
        .from(test_case_projects)
        .where(eq(test_case_projects.project_id, projectId));
      const linkedIds = new Set(links.map((l) => l.test_case_id));
      allCases = allCases.filter((tc) => linkedIds.has(tc.id));
    }

    // unclassifiedフィルタ: どのプロジェクトにも紐づかないテストケースのみ
    if (unclassified === true) {
      const links = await db
        .select({ test_case_id: test_case_projects.test_case_id })
        .from(test_case_projects);
      const classifiedIds = new Set(links.map((l) => l.test_case_id));
      allCases = allCases.filter((tc) => !classifiedIds.has(tc.id));
    }

    // display_order, id でソート
    allCases.sort((a, b) => a.display_order - b.display_order || a.id - b.id);

    return c.json(allCases.map(serializeTestCase));
  });

  // POST /api/test-cases - 新規テストケース作成
  router.post("/", zValidator("json", createTestCaseSchema), async (c) => {
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

    return c.json(serializeTestCase(testCase), 201);
  });

  // GET /api/test-cases/:id - 特定テストケース取得
  router.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [testCase] = await db.select().from(test_cases).where(eq(test_cases.id, id));

    if (!testCase) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    return c.json(serializeTestCase(testCase));
  });

  // PATCH /api/test-cases/:id - テストケース更新
  router.patch("/:id", zValidator("json", updateTestCaseSchema), async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(test_cases).where(eq(test_cases.id, id));
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

    const [updated] = await db
      .update(test_cases)
      .set(updateData)
      .where(eq(test_cases.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Failed to update TestCase" }, 500);
    }

    return c.json(serializeTestCase(updated));
  });

  // DELETE /api/test-cases/:id - テストケース削除
  router.delete("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(test_cases).where(eq(test_cases.id, id));
    if (!existing) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    // 中間テーブルのレコードを先に削除
    await db.delete(test_case_projects).where(eq(test_case_projects.test_case_id, id));
    await db.delete(test_case_context_assets).where(eq(test_case_context_assets.test_case_id, id));
    await db.delete(test_cases).where(eq(test_cases.id, id));

    return c.body(null, 204);
  });

  // PUT /api/test-cases/:id/projects - プロジェクトへのラベル付け（全置換）
  router.put("/:id/projects", zValidator("json", updateTestCaseProjectsSchema), async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(test_cases).where(eq(test_cases.id, id));
    if (!existing) {
      return c.json({ error: "TestCase not found" }, 404);
    }

    const body = c.req.valid("json");
    const projectIds = [...new Set(body.project_ids)];

    // 各project_idの存在確認
    for (const projectId of projectIds) {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        return c.json({ error: "Project not found" }, 404);
      }
    }

    // 既存の関連を全削除してから新規挿入
    await db.delete(test_case_projects).where(eq(test_case_projects.test_case_id, id));

    for (const projectId of projectIds) {
      await db.insert(test_case_projects).values({
        test_case_id: id,
        project_id: projectId,
        created_at: Date.now(),
      });
    }

    return c.json(serializeTestCase(existing));
  });

  // PUT /api/test-cases/:id/context-assets - context asset関連付け（全置換）
  router.put(
    "/:id/context-assets",
    zValidator("json", updateTestCaseContextAssetsSchema),
    async (c) => {
      const id = parseIdParam(c.req.param("id"));
      if (id === null) {
        return c.json({ error: "Invalid ID" }, 400);
      }

      const [existing] = await db.select().from(test_cases).where(eq(test_cases.id, id));
      if (!existing) {
        return c.json({ error: "TestCase not found" }, 404);
      }

      const body = c.req.valid("json");
      const contextAssetIds = [...new Set(body.context_asset_ids)];

      // 各context_asset_idの存在確認
      for (const contextAssetId of contextAssetIds) {
        const [asset] = await db
          .select()
          .from(context_assets)
          .where(eq(context_assets.id, contextAssetId));
        if (!asset) {
          return c.json({ error: "ContextAsset not found" }, 404);
        }
      }

      // 既存の関連を全削除してから新規挿入
      await db
        .delete(test_case_context_assets)
        .where(eq(test_case_context_assets.test_case_id, id));

      for (const contextAssetId of contextAssetIds) {
        await db.insert(test_case_context_assets).values({
          test_case_id: id,
          context_asset_id: contextAssetId,
          created_at: Date.now(),
        });
      }

      return c.json(serializeTestCase(existing));
    },
  );

  return router;
}
