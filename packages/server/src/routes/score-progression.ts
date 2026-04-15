import type { DB } from "@prompt-reviewer/core";
import { prompt_versions, runs, scores, test_cases } from "@prompt-reviewer/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

/** Convert string or undefined to integer. Returns null when invalid or undefined. */
function parseIntParam(value: string | undefined): number | null {
  if (value === undefined) return null;
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
 * GET /api/projects/:projectId/score-progression
 *
 * Returns aggregated score data for all versions in a project:
 * - versionSummaries: average scores per version (for the line chart)
 * - testCaseBreakdown: per-test-case scores broken down by version (for the table)
 */
export function createScoreProgressionRouter(db: DB) {
  const router = new Hono();

  router.get("/", async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    // Fetch all prompt versions for this project
    const versions = await db
      .select()
      .from(prompt_versions)
      .where(eq(prompt_versions.project_id, projectId));

    if (versions.length === 0) {
      return c.json({
        versionSummaries: [],
        testCaseBreakdown: [],
      } satisfies ScoreProgressionResponse);
    }

    // Fetch all runs for this project
    const allRuns = await db.select().from(runs).where(eq(runs.project_id, projectId));

    if (allRuns.length === 0) {
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

    const runIds = allRuns.map((r) => r.id);

    // Fetch all non-discarded scores for runs in this project
    const allScores = await db.select().from(scores).where(eq(scores.is_discarded, false));

    // Filter by run IDs belonging to this project (application-side IN filter)
    const projectScores = allScores.filter((s) => runIds.includes(s.run_id));

    // Build a map: runId -> score
    const scoreByRunId = new Map(projectScores.map((s) => [s.run_id, s]));

    // Build version summaries
    const versionSummaries: VersionSummary[] = versions
      .sort((a, b) => a.version - b.version)
      .map((v) => {
        const versionRuns = allRuns.filter((r) => r.prompt_version_id === v.id);
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

    // Fetch all test cases for this project
    const testCases = await db
      .select()
      .from(test_cases)
      .where(eq(test_cases.project_id, projectId));

    // Build test case breakdown
    // For each test case, for each version, find the best run's score (or any run's score)
    const testCaseBreakdown: TestCaseScoreBreakdown[] = testCases
      .sort((a, b) => a.display_order - b.display_order)
      .map((tc) => {
        const versionScores = versions
          .sort((a, b) => a.version - b.version)
          .map((v) => {
            const tcRuns = allRuns.filter(
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
