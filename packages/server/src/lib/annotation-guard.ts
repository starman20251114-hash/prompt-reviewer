import type { DB } from "@prompt-reviewer/core";
import { annotation_candidates, gold_annotations } from "@prompt-reviewer/core";
import { eq } from "drizzle-orm";

/**
 * 指定した test case に annotation データ（候補または確定）が存在するか確認する。
 * 存在する場合は context_content の更新を禁止するために使用する。
 */
export async function hasAnnotationData(db: DB, testCaseId: number): Promise<boolean> {
  const ref = `test_case:${testCaseId}`;

  const [candidate] = await db
    .select({ id: annotation_candidates.id })
    .from(annotation_candidates)
    .where(eq(annotation_candidates.target_text_ref, ref))
    .limit(1);

  if (candidate) return true;

  const [gold] = await db
    .select({ id: gold_annotations.id })
    .from(gold_annotations)
    .where(eq(gold_annotations.target_text_ref, ref))
    .limit(1);

  return !!gold;
}
