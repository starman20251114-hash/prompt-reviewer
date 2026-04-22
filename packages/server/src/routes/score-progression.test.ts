import type { DB } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createScoreProgressionRouter } from "./score-progression.js";

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/score-progression", createScoreProgressionRouter(db as DB));
  app.route("/api/projects/:projectId/score-progression", createScoreProgressionRouter(db as DB));
  return app;
}

describe("GET /api/projects/:projectId/score-progression", () => {
  it("新APIでも project_id クエリで同じ集計結果を返す", async () => {
    let selectCallCount = 0;

    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  {
                    id: 1,
                    project_id: null,
                    version: 1,
                    name: "v1",
                    content: "prompt",
                    workflow_definition: null,
                    created_at: 1,
                    updated_at: 1,
                  },
                ]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  {
                    id: 10,
                    project_id: 1,
                    prompt_version_id: 1,
                    test_case_id: 1,
                    conversation: "[]",
                    execution_trace: null,
                    is_best: true,
                    is_discarded: false,
                    created_at: 100,
                    model: "claude-sonnet-4-6",
                    temperature: 0.4,
                    api_provider: "anthropic",
                    execution_profile_id: 1,
                  },
                ]),
            }),
          };
        }
        if (selectCallCount === 4) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  {
                    id: 100,
                    run_id: 10,
                    human_score: 0.8,
                    judge_score: 0.7,
                    comment: null,
                    is_discarded: false,
                    created_at: 101,
                    updated_at: 101,
                  },
                ]),
            }),
          };
        }
        if (selectCallCount === 5) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () =>
              Promise.resolve([
                {
                  id: 1,
                  title: "ケース1",
                  turns: "[]",
                  context_content: "",
                  expected_description: null,
                  display_order: 0,
                  created_at: 1,
                  updated_at: 1,
                },
              ]),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/score-progression?project_id=1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      versionSummaries: Array<{ versionId: number; runCount: number; scoredCount: number }>;
    };

    expect(body.versionSummaries).toEqual([
      expect.objectContaining({
        versionId: 1,
        runCount: 1,
        scoredCount: 1,
      }),
    ]);
  });

  it("共有ラベルがあっても対象プロジェクトのRunだけを集計する", async () => {
    let selectCallCount = 0;

    const db = {
      select: () => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ prompt_version_id: 1 }]),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  {
                    id: 1,
                    project_id: null,
                    version: 1,
                    name: "v1",
                    content: "prompt",
                    workflow_definition: null,
                    created_at: 1,
                    updated_at: 1,
                  },
                ]),
            }),
          };
        }
        if (selectCallCount === 3) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  {
                    id: 10,
                    project_id: 1,
                    prompt_version_id: 1,
                    test_case_id: 1,
                    conversation: "[]",
                    execution_trace: null,
                    is_best: true,
                    is_discarded: false,
                    created_at: 100,
                    model: "claude-sonnet-4-6",
                    temperature: 0.4,
                    api_provider: "anthropic",
                    execution_profile_id: 1,
                  },
                ]),
            }),
          };
        }
        if (selectCallCount === 4) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  {
                    id: 100,
                    run_id: 10,
                    human_score: 0.8,
                    judge_score: 0.7,
                    comment: null,
                    is_discarded: false,
                    created_at: 101,
                    updated_at: 101,
                  },
                ]),
            }),
          };
        }
        if (selectCallCount === 5) {
          return {
            from: () => ({
              where: () => Promise.resolve([{ test_case_id: 1 }]),
            }),
          };
        }
        return {
          from: () => ({
            where: () =>
              Promise.resolve([
                {
                  id: 1,
                  title: "ケース1",
                  turns: "[]",
                  context_content: "",
                  expected_description: null,
                  display_order: 0,
                  created_at: 1,
                  updated_at: 1,
                },
              ]),
          }),
        };
      },
    };

    const app = buildApp(db);
    const res = await app.request("/api/projects/1/score-progression");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      versionSummaries: Array<{
        versionId: number;
        runCount: number;
        scoredCount: number;
        avgHumanScore: number | null;
        avgJudgeScore: number | null;
      }>;
      testCaseBreakdown: Array<{
        testCaseId: number;
        versions: Array<{ runId: number | null }>;
      }>;
    };

    expect(body.versionSummaries).toEqual([
      expect.objectContaining({
        versionId: 1,
        runCount: 1,
        scoredCount: 1,
        avgHumanScore: 0.8,
        avgJudgeScore: 0.7,
      }),
    ]);
    expect(body.testCaseBreakdown).toEqual([
      expect.objectContaining({
        testCaseId: 1,
        versions: [expect.objectContaining({ runId: 10 })],
      }),
    ]);
  });
});
