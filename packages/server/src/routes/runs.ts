import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import {
  AnthropicLLMClient,
  LLMAuthenticationError,
  LLMConfigurationError,
  project_settings,
  prompt_versions,
  runs,
  test_cases,
} from "@prompt-reviewer/core";
import type { ConversationMessage, LLMClient, LLMRequest } from "@prompt-reviewer/core";
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

const executeRunSchema = z.object({
  prompt_version_id: z.number().int().positive("prompt_version_idは正の整数が必要です"),
  test_case_id: z.number().int().positive("test_case_idは正の整数が必要です"),
  api_key: z.string().min(1, "api_keyは1文字以上必要です"),
});

type ExecuteRunBody = z.infer<typeof executeRunSchema>;

type RunExecutionClientFactoryInput = {
  apiProvider: string;
  apiKey: string;
};

type RunsRouterOptions = {
  llmClientFactory?: (input: RunExecutionClientFactoryInput) => LLMClient | null;
};

type StoredPromptVersion = {
  id: number;
  project_id: number;
  content: string;
};

type StoredTestCase = {
  id: number;
  project_id: number;
  turns: string;
  context_content: string;
};

type StoredProjectSettings = {
  model: string;
  temperature: number;
  api_provider: string;
};

const encoder = new TextEncoder();

function defaultLLMClientFactory(input: RunExecutionClientFactoryInput): LLMClient | null {
  if (input.apiProvider === "anthropic") {
    return new AnthropicLLMClient({ apiKey: input.apiKey });
  }

  return null;
}

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

function buildSystemPrompt(version: StoredPromptVersion, testCase: StoredTestCase): string {
  if (!testCase.context_content) {
    return version.content;
  }

  if (version.content.includes("{{context}}")) {
    return version.content.replace("{{context}}", testCase.context_content);
  }

  return `${version.content}\n\n${testCase.context_content}`;
}

function encodeSse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function normalizeExecuteError(error: unknown): { status: number; message: string } {
  if (error instanceof LLMConfigurationError) {
    return { status: 400, message: error.message };
  }

  if (error instanceof LLMAuthenticationError) {
    return { status: 401, message: error.message };
  }

  if (error instanceof Error) {
    return { status: 502, message: error.message };
  }

  return { status: 502, message: "Failed to execute Run" };
}

export function createRunsRouter(db: DB, options: RunsRouterOptions = {}) {
  const router = new Hono();
  const llmClientFactory = options.llmClientFactory ?? defaultLLMClientFactory;

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
        is_best: false,
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

  // POST /api/projects/:projectId/runs/execute - LLMに接続してRunを実行・保存
  router.post("/execute", zValidator("json", executeRunSchema), async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body: ExecuteRunBody = c.req.valid("json");

    const [[version], [testCase], [settings]] = await Promise.all([
      db
        .select()
        .from(prompt_versions)
        .where(
          and(
            eq(prompt_versions.id, body.prompt_version_id),
            eq(prompt_versions.project_id, projectId),
          ),
        ),
      db
        .select()
        .from(test_cases)
        .where(and(eq(test_cases.id, body.test_case_id), eq(test_cases.project_id, projectId))),
      db.select().from(project_settings).where(eq(project_settings.project_id, projectId)),
    ]);

    if (!version) {
      return c.json({ error: "Prompt version not found" }, 404);
    }

    if (!testCase) {
      return c.json({ error: "Test case not found" }, 404);
    }

    if (!settings) {
      return c.json({ error: "Project settings not found" }, 404);
    }

    const client = llmClientFactory({
      apiProvider: settings.api_provider,
      apiKey: body.api_key,
    });

    if (!client) {
      return c.json({ error: "Provider execution is not implemented" }, 501);
    }

    const messages = parseConversation(testCase.turns);
    const request: LLMRequest = {
      model: settings.model,
      messages,
      systemPrompt: buildSystemPrompt(version, testCase),
      temperature: settings.temperature,
    };

    return new Response(
      new ReadableStream({
        async start(controller) {
          let assistantContent = "";

          try {
            for await (const event of client.stream(request)) {
              if (event.type === "text-delta") {
                assistantContent += event.text;
                controller.enqueue(encodeSse("delta", { text: event.text }));
              }
            }

            const conversation: ConversationMessage[] = [
              ...messages,
              { role: "assistant", content: assistantContent },
            ];

            const [created] = await db
              .insert(runs)
              .values({
                project_id: projectId,
                prompt_version_id: body.prompt_version_id,
                test_case_id: body.test_case_id,
                conversation: JSON.stringify(conversation),
                is_best: false,
                model: settings.model,
                temperature: settings.temperature,
                api_provider: settings.api_provider,
                created_at: Date.now(),
              })
              .returning();

            if (!created) {
              controller.enqueue(
                encodeSse("error", { status: 500, message: "Failed to create Run" }),
              );
              return;
            }

            controller.enqueue(
              encodeSse("run", {
                ...created,
                conversation: parseConversation(created.conversation),
              }),
            );
          } catch (error) {
            controller.enqueue(encodeSse("error", normalizeExecuteError(error)));
          } finally {
            controller.close();
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
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
  // { unset: true } を渡すと解除のみ行う
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

    const body = (await c.req.json().catch(() => ({}))) as { unset?: boolean };

    if (body.unset) {
      // ベスト解除
      const updateResult = await db
        .update(runs)
        .set({ is_best: false })
        .where(and(eq(runs.id, id), eq(runs.project_id, projectId)))
        .returning();
      const updated = updateResult[0];
      if (!updated) return c.json({ error: "Failed to update Run" }, 500);
      return c.json({ ...updated, conversation: parseConversation(updated.conversation) });
    }

    // 同一 prompt_version_id × test_case_id の既存フラグを解除
    await db
      .update(runs)
      .set({ is_best: false })
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
      .set({ is_best: true })
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
