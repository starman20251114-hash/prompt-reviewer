import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import { annotation_candidates, annotation_labels, gold_annotations } from "@prompt-reviewer/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

// ---- スキーマ定義 ----

const patchCandidateSchema = z
  .object({
    label: z.string().min(1).optional(),
    start_line: z.number().int().min(1).optional(),
    end_line: z.number().int().optional(),
    note: z.string().nullable().optional(),
    status: z.enum(["pending", "accepted", "rejected"]).optional(),
  })
  .refine(
    (data) => {
      if (data.start_line !== undefined && data.end_line !== undefined) {
        return data.end_line >= data.start_line;
      }
      return true;
    },
    { message: "end_line は start_line 以上でなければなりません", path: ["end_line"] },
  );

// ---- annotation_candidates ルーター ----

export function createAnnotationCandidatesRouter(db: DB) {
  const router = new Hono();

  // GET /api/annotation-candidates
  router.get("/", async (c) => {
    const annotationTaskIdParam = c.req.query("annotation_task_id");
    const runIdParam = c.req.query("run_id");
    const testCaseIdParam = c.req.query("test_case_id");
    const statusParam = c.req.query("status");

    const conditions = [];

    if (annotationTaskIdParam !== undefined) {
      const annotationTaskId = Number(annotationTaskIdParam);
      if (!Number.isNaN(annotationTaskId)) {
        conditions.push(eq(annotation_candidates.annotation_task_id, annotationTaskId));
      }
    }

    if (runIdParam !== undefined) {
      const runId = Number(runIdParam);
      if (!Number.isNaN(runId)) {
        conditions.push(eq(annotation_candidates.run_id, runId));
      }
    }

    if (testCaseIdParam !== undefined) {
      const testCaseId = Number(testCaseIdParam);
      if (!Number.isNaN(testCaseId)) {
        conditions.push(eq(annotation_candidates.target_text_ref, `test_case:${testCaseId}`));
      }
    }

    if (statusParam !== undefined) {
      if (statusParam === "pending" || statusParam === "accepted" || statusParam === "rejected") {
        conditions.push(eq(annotation_candidates.status, statusParam));
      }
    }

    const query = db.select().from(annotation_candidates);

    const result =
      conditions.length === 0
        ? await query.orderBy(annotation_candidates.id)
        : conditions.length === 1
          ? await query.where(conditions[0]).orderBy(annotation_candidates.id)
          : await query.where(and(...conditions)).orderBy(annotation_candidates.id);

    return c.json(result);
  });

  // PATCH /api/annotation-candidates/:id
  router.patch("/:id", zValidator("json", patchCandidateSchema), async (c) => {
    const id = Number(c.req.param("id"));

    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const body = c.req.valid("json");

    // start_line のみ指定されて end_line が省略の場合、既存 end_line と比較できないためここでは許容
    // (start_line > end_line のチェックは zod の refine で両方指定時のみ行う)

    const [existing] = await db
      .select()
      .from(annotation_candidates)
      .where(eq(annotation_candidates.id, id));

    if (!existing) {
      return c.json({ error: "Annotation candidate not found" }, 404);
    }

    if (body.label !== undefined) {
      const labels = await db
        .select({ key: annotation_labels.key })
        .from(annotation_labels)
        .where(eq(annotation_labels.annotation_task_id, existing.annotation_task_id));
      const validLabelKeys = new Set(labels.map((label) => label.key));

      if (!validLabelKeys.has(body.label)) {
        return c.json(
          { error: `Label "${body.label}" is not valid for this annotation task` },
          400,
        );
      }
    }

    // 片方のみ指定された場合の start_line > end_line チェック
    const resolvedStartLine = body.start_line ?? existing.start_line;
    const resolvedEndLine = body.end_line ?? existing.end_line;

    if (resolvedEndLine < resolvedStartLine) {
      return c.json({ error: "end_line は start_line 以上でなければなりません" }, 400);
    }

    const now = Date.now();

    const updateData: {
      label?: string;
      start_line?: number;
      end_line?: number;
      note?: string | null;
      status?: "pending" | "accepted" | "rejected";
      updated_at: number;
    } = { updated_at: now };

    if (body.label !== undefined) updateData.label = body.label;
    if (body.start_line !== undefined) updateData.start_line = body.start_line;
    if (body.end_line !== undefined) updateData.end_line = body.end_line;
    if (body.note !== undefined) updateData.note = body.note;
    if (body.status !== undefined) updateData.status = body.status;

    const updated = await db
      .update(annotation_candidates)
      .set(updateData)
      .where(eq(annotation_candidates.id, id))
      .returning();

    const updatedCandidate = updated[0];

    if (!updatedCandidate) {
      return c.json({ error: "Annotation candidate not found" }, 404);
    }

    // status が "accepted" に変更された場合は gold_annotation を作成する
    if (body.status === "accepted") {
      const [existingGold] = await db
        .select()
        .from(gold_annotations)
        .where(eq(gold_annotations.source_candidate_id, updatedCandidate.id));

      if (existingGold) {
        return c.json({ candidate: updatedCandidate, gold: existingGold });
      }

      const inserted = await db
        .insert(gold_annotations)
        .values({
          annotation_task_id: updatedCandidate.annotation_task_id,
          target_text_ref: updatedCandidate.target_text_ref,
          label: updatedCandidate.label,
          start_line: updatedCandidate.start_line,
          end_line: updatedCandidate.end_line,
          quote: updatedCandidate.quote,
          note: updatedCandidate.note ?? null,
          source_candidate_id: updatedCandidate.id,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const createdGold = inserted[0];

      return c.json({ candidate: updatedCandidate, gold: createdGold });
    }

    return c.json({ candidate: updatedCandidate });
  });

  return router;
}

// ---- gold_annotations ルーター ----

export function createGoldAnnotationsRouter(db: DB) {
  const router = new Hono();

  // GET /api/gold-annotations
  router.get("/", async (c) => {
    const annotationTaskIdParam = c.req.query("annotation_task_id");
    const testCaseIdParam = c.req.query("test_case_id");

    const conditions = [];

    if (annotationTaskIdParam !== undefined) {
      const annotationTaskId = Number(annotationTaskIdParam);
      if (!Number.isNaN(annotationTaskId)) {
        conditions.push(eq(gold_annotations.annotation_task_id, annotationTaskId));
      }
    }

    if (testCaseIdParam !== undefined) {
      const testCaseId = Number(testCaseIdParam);
      if (!Number.isNaN(testCaseId)) {
        conditions.push(eq(gold_annotations.target_text_ref, `test_case:${testCaseId}`));
      }
    }

    const query = db.select().from(gold_annotations);

    const result =
      conditions.length === 0
        ? await query.orderBy(gold_annotations.id)
        : conditions.length === 1
          ? await query.where(conditions[0]).orderBy(gold_annotations.id)
          : await query.where(and(...conditions)).orderBy(gold_annotations.id);

    return c.json(result);
  });

  return router;
}
