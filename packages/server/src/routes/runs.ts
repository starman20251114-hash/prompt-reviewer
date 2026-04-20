import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import {
  AnthropicLLMClient,
  type ExecutionTraceStep,
  LLMAuthenticationError,
  LLMConfigurationError,
  type PromptExecutionStepDefinition,
  type PromptWorkflowDefinition,
  execution_profiles,
  prompt_version_projects,
  prompt_versions,
  runs,
  test_case_projects,
  test_cases,
} from "@prompt-reviewer/core";
import type { ConversationMessage, LLMClient, LLMRequest } from "@prompt-reviewer/core";
import { and, eq, inArray } from "drizzle-orm";
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
  execution_trace: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        prompt: z.string(),
        renderedPrompt: z.string(),
        inputConversation: z.array(conversationMessageSchema),
        output: z.string(),
      }),
    )
    .optional(),
  model: z.string().min(1, "modelは1文字以上必要です"),
  temperature: z.number().min(0).max(2),
  api_provider: z.string().min(1, "api_providerは1文字以上必要です"),
  execution_profile_id: z
    .number()
    .int()
    .positive("execution_profile_idは正の整数が必要です")
    .optional(),
});

const executeRunSchema = z.object({
  prompt_version_id: z.number().int().positive("prompt_version_idは正の整数が必要です"),
  test_case_id: z.number().int().positive("test_case_idは正の整数が必要です"),
  api_key: z.string().min(1, "api_keyは1文字以上必要です"),
  execution_profile_id: z
    .number()
    .int()
    .positive("execution_profile_idは正の整数が必要です")
    .optional(),
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
  project_id: number | null;
  content: string;
  workflow_definition: string | null;
};

type StoredTestCase = {
  id: number;
  turns: string;
  context_content: string;
};

type ExecutionSettings = {
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

function parseWorkflowDefinition(json: string | null): PromptWorkflowDefinition | null {
  if (!json) {
    return null;
  }

  return JSON.parse(json) as PromptWorkflowDefinition;
}

function parseExecutionTrace(json: string | null): ExecutionTraceStep[] | null {
  if (!json) {
    return null;
  }

  return JSON.parse(json) as ExecutionTraceStep[];
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

function buildWorkflowConversation(messages: ConversationMessage[]): ConversationMessage[] {
  return [...messages];
}

function buildWorkflowSteps(
  version: StoredPromptVersion,
  workflow: PromptWorkflowDefinition | null,
): PromptExecutionStepDefinition[] {
  if (!workflow || workflow.steps.length === 0) {
    return [];
  }

  return [
    {
      id: "__base_prompt__",
      title: "プロンプト本文",
      prompt: version.content,
    },
    ...workflow.steps,
  ];
}

function renderWorkflowPrompt(params: {
  step: PromptExecutionStepDefinition;
  version: StoredPromptVersion;
  testCase: StoredTestCase;
  conversation: ConversationMessage[];
  previousOutput: string | null;
  stepOutputs: Map<string, string>;
}): string {
  const conversationText = params.conversation
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
  const effectiveContext = params.previousOutput ?? params.testCase.context_content;

  let rendered = params.step.prompt
    .replaceAll("{{prompt}}", params.version.content)
    .replaceAll("{{context}}", effectiveContext)
    .replaceAll("{{conversation}}", conversationText)
    .replaceAll("{{previous_output}}", params.previousOutput ?? "");

  rendered = rendered.replace(/\{\{step:([\w-]+)\}\}/g, (_, stepId: string) => {
    return params.stepOutputs.get(stepId) ?? "";
  });

  if (effectiveContext && !params.step.prompt.includes("{{context}}")) {
    rendered = `${rendered}\n\n${effectiveContext}`;
  }

  return rendered;
}

function buildExecutionRequest(params: {
  model: string;
  messages: ConversationMessage[];
  systemPrompt: string;
  temperature: number;
}): { request: LLMRequest; conversationBase: ConversationMessage[] } | null {
  if (params.messages.length > 0) {
    return {
      request: {
        model: params.model,
        messages: params.messages,
        systemPrompt: params.systemPrompt,
        temperature: params.temperature,
      },
      conversationBase: params.messages,
    };
  }

  const promptMessage = params.systemPrompt.trim();
  if (promptMessage.length === 0) {
    return null;
  }

  const fallbackMessages: ConversationMessage[] = [{ role: "user", content: promptMessage }];
  return {
    request: {
      model: params.model,
      messages: fallbackMessages,
      temperature: params.temperature,
    },
    conversationBase: fallbackMessages,
  };
}

function serializeRun(run: typeof runs.$inferSelect): Omit<
  typeof run,
  "conversation" | "execution_trace"
> & {
  conversation: ConversationMessage[];
  execution_trace: ExecutionTraceStep[] | null;
} {
  return {
    ...run,
    conversation: parseConversation(run.conversation),
    execution_trace: parseExecutionTrace(run.execution_trace),
  };
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

/**
 * projectIdに紐づく prompt_version_id 一覧を prompt_version_projects 経由で取得する
 */
async function fetchVersionIdsByProject(db: DB, projectId: number): Promise<number[]> {
  const links = await db
    .select({ prompt_version_id: prompt_version_projects.prompt_version_id })
    .from(prompt_version_projects)
    .where(eq(prompt_version_projects.project_id, projectId));
  return links.map((l) => l.prompt_version_id);
}

/**
 * projectIdに紐づく test_case_id 一覧を test_case_projects 経由で取得する
 */
async function fetchTestCaseIdsByProject(db: DB, projectId: number): Promise<number[]> {
  const links = await db
    .select({ test_case_id: test_case_projects.test_case_id })
    .from(test_case_projects)
    .where(eq(test_case_projects.project_id, projectId));
  return links.map((l) => l.test_case_id);
}

export function createRunsRouter(db: DB, options: RunsRouterOptions = {}) {
  const router = new Hono();
  const llmClientFactory = options.llmClientFactory ?? defaultLLMClientFactory;

  // GET /api/projects/:projectId/runs - Run一覧取得（prompt_version_id / test_case_id でフィルタ可能）
  // project_id フィルタは prompt_version_projects 基準で実装
  router.get("/", async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const promptVersionIdParam = c.req.query("prompt_version_id");
    const testCaseIdParam = c.req.query("test_case_id");

    // prompt_version_projects 経由でプロジェクトに紐づくバージョンIDを取得
    const versionIds = await fetchVersionIdsByProject(db, projectId);

    if (versionIds.length === 0) {
      return c.json([]);
    }

    const conditions = [
      eq(runs.project_id, projectId),
      inArray(runs.prompt_version_id, versionIds),
      eq(runs.is_discarded, false),
    ];

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

    return c.json(result.map(serializeRun));
  });

  // POST /api/projects/:projectId/runs - 新規Run作成
  router.post("/", zValidator("json", createRunSchema), async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");

    // prompt_version_projects でプロジェクトへの紐づきを確認
    const [versionLink] = await db
      .select()
      .from(prompt_version_projects)
      .where(
        and(
          eq(prompt_version_projects.prompt_version_id, body.prompt_version_id),
          eq(prompt_version_projects.project_id, projectId),
        ),
      );

    if (!versionLink) {
      return c.json({ error: "Prompt version not found in this project" }, 404);
    }

    const result = await db
      .insert(runs)
      .values({
        project_id: projectId,
        prompt_version_id: body.prompt_version_id,
        test_case_id: body.test_case_id,
        conversation: JSON.stringify(body.conversation),
        execution_trace: body.execution_trace ? JSON.stringify(body.execution_trace) : null,
        is_best: false,
        is_discarded: false,
        model: body.model,
        temperature: body.temperature,
        api_provider: body.api_provider,
        execution_profile_id: body.execution_profile_id ?? null,
        created_at: Date.now(),
      })
      .returning();

    const created = result[0];
    if (!created) {
      return c.json({ error: "Failed to create Run" }, 500);
    }

    return c.json(serializeRun(created), 201);
  });

  // POST /api/projects/:projectId/runs/execute - LLMに接続してRunを実行・保存
  // execution_profile_id が指定された場合はそこから実行設定を取得する
  router.post("/execute", zValidator("json", executeRunSchema), async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));

    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body: ExecuteRunBody = c.req.valid("json");

    // prompt_version_projects 経由でバージョンの所属を確認
    const [versionLink] = await db
      .select()
      .from(prompt_version_projects)
      .where(
        and(
          eq(prompt_version_projects.prompt_version_id, body.prompt_version_id),
          eq(prompt_version_projects.project_id, projectId),
        ),
      );

    if (!versionLink) {
      return c.json({ error: "Prompt version not found" }, 404);
    }

    // test_case_projects 経由でテストケースの所属を確認
    const [testCaseLink] = await db
      .select()
      .from(test_case_projects)
      .where(
        and(
          eq(test_case_projects.test_case_id, body.test_case_id),
          eq(test_case_projects.project_id, projectId),
        ),
      );

    if (!testCaseLink) {
      return c.json({ error: "Test case not found" }, 404);
    }

    const [[version], [testCase]] = await Promise.all([
      db.select().from(prompt_versions).where(eq(prompt_versions.id, body.prompt_version_id)),
      db.select().from(test_cases).where(eq(test_cases.id, body.test_case_id)),
    ]);

    if (!version) {
      return c.json({ error: "Prompt version not found" }, 404);
    }

    if (!testCase) {
      return c.json({ error: "Test case not found" }, 404);
    }

    // execution_profile_id が指定された場合はそこから設定を取得（snapshotとして保存）
    // 未指定の場合はプロジェクト設定にフォールバック
    let settings: ExecutionSettings;
    let resolvedExecutionProfileId: number | null = null;

    if (body.execution_profile_id !== undefined) {
      const [profile] = await db
        .select()
        .from(execution_profiles)
        .where(eq(execution_profiles.id, body.execution_profile_id));

      if (!profile) {
        return c.json({ error: "Execution profile not found" }, 404);
      }

      settings = {
        model: profile.model,
        temperature: profile.temperature,
        api_provider: profile.api_provider,
      };
      resolvedExecutionProfileId = profile.id;
    } else {
      // execution_profile_id 未指定の場合はデフォルト設定を使用
      return c.json({ error: "execution_profile_id is required" }, 400);
    }

    const client = llmClientFactory({
      apiProvider: settings.api_provider,
      apiKey: body.api_key,
    });

    if (!client) {
      return c.json({ error: "Provider execution is not implemented" }, 501);
    }

    const storedTestCase: StoredTestCase = {
      id: testCase.id,
      turns: testCase.turns,
      context_content: testCase.context_content,
    };

    const execution = buildExecutionRequest({
      model: settings.model,
      messages: parseConversation(storedTestCase.turns),
      systemPrompt: buildSystemPrompt(version, storedTestCase),
      temperature: settings.temperature,
    });
    const workflow = parseWorkflowDefinition(version.workflow_definition);
    const workflowSteps = buildWorkflowSteps(version, workflow);

    if (!execution) {
      return c.json({ error: "Prompt or test case turns are required" }, 400);
    }

    return new Response(
      new ReadableStream({
        async start(controller) {
          let assistantContent = "";
          const executionTrace: ExecutionTraceStep[] = [];

          try {
            if (workflowSteps.length > 0) {
              const baseMessages = parseConversation(storedTestCase.turns);
              const stepOutputs = new Map<string, string>();

              for (const step of workflowSteps) {
                const inputConversation = buildWorkflowConversation(baseMessages);
                const renderedPrompt = renderWorkflowPrompt({
                  step,
                  version,
                  testCase: storedTestCase,
                  conversation: inputConversation,
                  previousOutput:
                    executionTrace.length > 0
                      ? (executionTrace[executionTrace.length - 1]?.output ?? null)
                      : null,
                  stepOutputs,
                });
                const stepExecution = buildExecutionRequest({
                  model: settings.model,
                  messages: inputConversation,
                  systemPrompt: renderedPrompt,
                  temperature: settings.temperature,
                });

                if (!stepExecution) {
                  controller.enqueue(
                    encodeSse("error", { status: 400, message: `Step ${step.id} is empty` }),
                  );
                  return;
                }

                controller.enqueue(
                  encodeSse("step-start", {
                    id: step.id,
                    title: step.title,
                    prompt: step.prompt,
                    renderedPrompt,
                    inputConversation,
                  }),
                );

                let stepOutput = "";
                for await (const event of client.stream(stepExecution.request)) {
                  if (event.type === "text-delta") {
                    stepOutput += event.text;
                    controller.enqueue(
                      encodeSse("step-delta", {
                        id: step.id,
                        title: step.title,
                        text: event.text,
                      }),
                    );
                  }

                  if (event.type === "response") {
                    stepOutput = event.response.content;
                  }
                }

                stepOutputs.set(step.id, stepOutput);
                executionTrace.push({
                  id: step.id,
                  title: step.title,
                  prompt: step.prompt,
                  renderedPrompt,
                  inputConversation,
                  output: stepOutput,
                });

                controller.enqueue(
                  encodeSse("step-complete", executionTrace[executionTrace.length - 1]),
                );
              }
              assistantContent = executionTrace[executionTrace.length - 1]?.output ?? "";
            } else {
              for await (const event of client.stream(execution.request)) {
                if (event.type === "text-delta") {
                  assistantContent += event.text;
                  controller.enqueue(encodeSse("delta", { text: event.text }));
                }

                if (event.type === "response") {
                  assistantContent = event.response.content;
                }
              }
            }

            const conversation: ConversationMessage[] = [
              ...execution.conversationBase,
              { role: "assistant", content: assistantContent },
            ];

            const [created] = await db
              .insert(runs)
              .values({
                project_id: projectId,
                prompt_version_id: body.prompt_version_id,
                test_case_id: body.test_case_id,
                conversation: JSON.stringify(conversation),
                execution_trace: executionTrace.length > 0 ? JSON.stringify(executionTrace) : null,
                is_best: false,
                is_discarded: false,
                // execution_profile からのスナップショットを保存
                model: settings.model,
                temperature: settings.temperature,
                api_provider: settings.api_provider,
                execution_profile_id: resolvedExecutionProfileId,
                created_at: Date.now(),
              })
              .returning();

            if (!created) {
              controller.enqueue(
                encodeSse("error", { status: 500, message: "Failed to create Run" }),
              );
              return;
            }

            controller.enqueue(encodeSse("run", serializeRun(created)));
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

    // prompt_version_projects 経由でプロジェクトに紐づくバージョンIDを取得
    const versionIds = await fetchVersionIdsByProject(db, projectId);

    if (versionIds.length === 0) {
      return c.json({ error: "Run not found" }, 404);
    }

    const [run] = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.id, id),
          eq(runs.project_id, projectId),
          inArray(runs.prompt_version_id, versionIds),
        ),
      );

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return c.json(serializeRun(run));
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

    // prompt_version_projects 経由でプロジェクトに紐づくバージョンIDを取得
    const versionIds = await fetchVersionIdsByProject(db, projectId);

    if (versionIds.length === 0) {
      return c.json({ error: "Run not found" }, 404);
    }

    const [existing] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), inArray(runs.prompt_version_id, versionIds)));

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
      return c.json(serializeRun(updated));
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

    return c.json(serializeRun(updated));
  });

  // PATCH /api/projects/:projectId/runs/:id/discard - Run破棄
  router.patch("/:id/discard", async (c) => {
    const projectId = parseIntParam(c.req.param("projectId"));
    const id = parseIntParam(c.req.param("id"));

    if (projectId === null || id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    // prompt_version_projects 経由でプロジェクトに紐づくバージョンIDを取得
    const versionIds = await fetchVersionIdsByProject(db, projectId);

    if (versionIds.length === 0) {
      return c.json({ error: "Run not found" }, 404);
    }

    const [existing] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), inArray(runs.prompt_version_id, versionIds)));

    if (!existing) {
      return c.json({ error: "Run not found" }, 404);
    }

    const updateResult = await db
      .update(runs)
      .set({ is_discarded: true })
      .where(and(eq(runs.id, id), eq(runs.project_id, projectId)))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update Run" }, 500);
    }

    return c.json(serializeRun(updated));
  });

  return router;
}
