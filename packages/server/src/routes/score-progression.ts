import type { DB } from "@prompt-reviewer/core";
import {
  prompt_version_projects,
  prompt_versions,
  runs,
  scores,
  test_case_projects,
  test_cases,
} from "@prompt-reviewer/core";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";

/** Convert string or undefined to integer. Returns undefined when omitted and null when invalid. */
function parseOptionalInt(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export type VersionSummary = {
  versionId: number;
  versionNumber: number;
  versionName: string | null;
  avgHumanScore: number | null;
  avgJudgeScore: number | null;
  runCount: number;
  scoredCount: number;
};

export type TestCaseScoreBreakdown = {
  testCaseId: number;
  testCaseTitle: string;
  versions: {
    versionId: number;
    versionNumber: number;
    versionName: string | null;
    humanScore: number | null;
    judgeScore: number | null;
    runId: number | null;
  }[];
};

export type ScoreProgressionResponse = {
  versionSummaries: VersionSummary[];
  testCaseBreakdown: TestCaseScoreBreakdown[];
};

/**
 * Score progression router
 * GET /api/score-progression
 *
 * Returns aggregated score data for all versions in a project:
 * - versionSummaries: average scores per version (for the line chart)
 * - testCaseBreakdown: per-test-case scores broken down by version (for the table)
 *
 * project_id フィルタはクエリパラメータ経由で prompt_version_projects / test_case_projects を参照する
 */
export function createScoreProgressionRouter(db: DB) {
  const router = new Hono();

  router.get("/", async (c) => {
    const projectId = parseOptionalInt(c.req.query("project_id"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const versionIds =
      projectId !== undefined
        ? (
            await db
              .select({ prompt_version_id: prompt_version_projects.prompt_version_id })
              .from(prompt_version_projects)
              .where(eq(prompt_version_projects.project_id, projectId))
          ).map((l) => l.prompt_version_id)
        : [];

    if (projectId !== undefined && versionIds.length === 0) {
      return c.json({
        versionSummaries: [],
        testCaseBreakdown: [],
      } satisfies ScoreProgressionResponse);
    }

    // バージョン詳細を取得
    const versions =
      projectId !== undefined
        ? await db.select().from(prompt_versions).where(inArray(prompt_versions.id, versionIds))
        : await db.select().from(prompt_versions);

    if (versions.length === 0) {
      return c.json({
        versionSummaries: [],
        testCaseBreakdown: [],
      } satisfies ScoreProgressionResponse);
    }

    // prompt_version_projects 基準でRunを取得
    const allRuns =
      projectId !== undefined
        ? await db.select().from(runs).where(inArray(runs.prompt_version_id, versionIds))
        : await db.select().from(runs);
    const evaluationRuns = allRuns.filter((run) => run.test_case_id !== null);

    if (evaluationRuns.length === 0) {
      const emptySummaries: VersionSummary[] = versions.map((v) => ({
        versionId: v.id,
        versionNumber: v.version,
        versionName: v.name,
        avgHumanScore: null,
        avgJudgeScore: null,
        runCount: 0,
        scoredCount: 0,
      }));
      return c.json({
        versionSummaries: emptySummaries,
        testCaseBreakdown: [],
      } satisfies ScoreProgressionResponse);
    }

    const runIds = evaluationRuns.map((r) => r.id);

    // 対象Runのスコアを取得
    const allScores = await db
      .select()
      .from(scores)
      .where(and(inArray(scores.run_id, runIds), eq(scores.is_discarded, false)));

    // Build a map: runId -> score
    const scoreByRunId = new Map(allScores.map((s) => [s.run_id, s]));

    // Build version summaries
    const versionSummaries: VersionSummary[] = versions
      .sort((a, b) => a.version - b.version)
      .map((v) => {
        const versionRuns = evaluationRuns.filter((r) => r.prompt_version_id === v.id);
        const versionScores = versionRuns
          .map((r) => scoreByRunId.get(r.id))
          .filter((s): s is NonNullable<typeof s> => s !== undefined);

        const humanScores = versionScores
          .map((s) => s.human_score)
          .filter((v): v is number => v !== null);
        const judgeScores = versionScores
          .map((s) => s.judge_score)
          .filter((v): v is number => v !== null);

        const avgHumanScore =
          humanScores.length > 0
            ? humanScores.reduce((sum, v) => sum + v, 0) / humanScores.length
            : null;

        const avgJudgeScore =
          judgeScores.length > 0
            ? judgeScores.reduce((sum, v) => sum + v, 0) / judgeScores.length
            : null;

        return {
          versionId: v.id,
          versionNumber: v.version,
          versionName: v.name,
          avgHumanScore,
          avgJudgeScore,
          runCount: versionRuns.length,
          scoredCount: versionScores.length,
        };
      });

    // test_case_projects 経由でプロジェクトに紐づくテストケースIDを取得
    const testCaseIds =
      projectId !== undefined
        ? (
            await db
              .select({ test_case_id: test_case_projects.test_case_id })
              .from(test_case_projects)
              .where(eq(test_case_projects.project_id, projectId))
          ).map((l) => l.test_case_id)
        : [...new Set(evaluationRuns.map((run) => run.test_case_id).filter((id) => id !== null))];

    if (testCaseIds.length === 0) {
      return c.json({
        versionSummaries,
        testCaseBreakdown: [],
      } satisfies ScoreProgressionResponse);
    }

    const testCases = await db.select().from(test_cases).where(inArray(test_cases.id, testCaseIds));

    // Build test case breakdown
    // For each test case, for each version, find the best run's score (or any run's score)
    const testCaseBreakdown: TestCaseScoreBreakdown[] = testCases
      .sort((a, b) => a.display_order - b.display_order)
      .map((tc) => {
        const versionScores = versions
          .sort((a, b) => a.version - b.version)
          .map((v) => {
            const tcRuns = evaluationRuns.filter(
              (r) => r.prompt_version_id === v.id && r.test_case_id === tc.id,
            );

            // Prefer best run, fall back to latest run
            const bestRun = tcRuns.find((r) => r.is_best);
            const targetRun = bestRun ?? tcRuns.sort((a, b) => b.created_at - a.created_at)[0];

            if (!targetRun) {
              return {
                versionId: v.id,
                versionNumber: v.version,
                versionName: v.name,
                humanScore: null,
                judgeScore: null,
                runId: null,
              };
            }

            const score = scoreByRunId.get(targetRun.id);
            return {
              versionId: v.id,
              versionNumber: v.version,
              versionName: v.name,
              humanScore: score?.human_score ?? null,
              judgeScore: score?.judge_score ?? null,
              runId: targetRun.id,
            };
          });

        return {
          testCaseId: tc.id,
          testCaseTitle: tc.title,
          versions: versionScores,
        };
      });

    return c.json({
      versionSummaries,
      testCaseBreakdown,
    } satisfies ScoreProgressionResponse);
  });

  return router;
}
