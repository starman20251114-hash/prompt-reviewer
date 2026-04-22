import { zValidator } from "@hono/zod-validator";
import type { DB } from "@prompt-reviewer/core";
import {
  AnthropicLLMClient,
  type ExecutionTraceStep,
  LLMAuthenticationError,
  LLMConfigurationError,
  type PromptExecutionStepDefinition,
  type PromptWorkflowDefinition,
  type StructuredOutput,
  annotation_candidates,
  annotation_labels,
  annotation_tasks,
  execution_profiles,
  project_settings,
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

const structuredOutputSchema = z.object({
  items: z.array(
    z.object({
      label: z.string().min(1, "labelは1文字以上必要です"),
      start_line: z.number().int(),
      end_line: z.number().int(),
      quote: z.string().min(1, "quoteは1文字以上必要です"),
      rationale: z.string().min(1).optional(),
    }),
  ),
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
  structured_output: structuredOutputSchema.nullable().optional(),
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
  structured_output: structuredOutputSchema.nullable().optional(),
  execution_profile_id: z
    .number()
    .int()
    .positive("execution_profile_idは正の整数が必要です")
    .optional(),
});

const legacyCreateRunSchema = createRunSchema.extend({
  model: z.string().min(1, "modelは1文字以上必要です").optional(),
  temperature: z.number().min(0).max(2).optional(),
  api_provider: z.string().min(1, "api_providerは1文字以上必要です").optional(),
});

const legacyExecuteRunSchema = executeRunSchema.extend({
  api_key: z.string().min(1, "api_keyは1文字以上必要です"),
});

type ExecuteRunBody = z.infer<typeof executeRunSchema>;
type CandidateSourceType = "structured_json" | "final_answer" | "trace_step";

const extractCandidatesSchema = z
  .object({
    annotation_task_id: z.number().int().positive(),
    source_type: z.enum(["structured_json", "final_answer", "trace_step"]).optional(),
    source_step_id: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.source_type === "trace_step" && !value.source_step_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_step_id is required when source_type is trace_step",
        path: ["source_step_id"],
      });
    }

    if (value.source_type !== "trace_step" && value.source_step_id !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_step_id can only be used when source_type is trace_step",
        path: ["source_step_id"],
      });
    }
  });

type RunExecutionClientFactoryInput = {
  apiProvider: string;
  apiKey: string;
};

type RunsRouterOptions = {
  llmClientFactory?: (input: RunExecutionClientFactoryInput) => LLMClient | null;
  enableCandidateExtractRoute?: boolean;
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
  max_tokens: number | null;
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

function parseStructuredOutput(json: string | null): StructuredOutput | null {
  if (!json) {
    return null;
  }

  return JSON.parse(json) as StructuredOutput;
}

function peekNextNonWhitespace(text: string, startIndex: number): string | null {
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === undefined) {
      return null;
    }
    if (!/\s/.test(char)) {
      return char;
    }
  }

  return null;
}

function sanitizeLenientJson(text: string): string {
  let result = "";
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaping = true;
      continue;
    }

    if (char === '"') {
      if (inString) {
        const nextNonWhitespace = peekNextNonWhitespace(text, index + 1);
        if (
          nextNonWhitespace !== null &&
          nextNonWhitespace !== "," &&
          nextNonWhitespace !== "}" &&
          nextNonWhitespace !== "]" &&
          nextNonWhitespace !== ":"
        ) {
          result += '\\"';
          continue;
        }
      }

      result += char;
      inString = !inString;
      continue;
    }

    if (inString && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      result += "\\n";
      continue;
    }

    result += char;
  }

  return result;
}

function extractJsonFromText(text: string): unknown {
  const normalizedText = sanitizeLenientJson(text);

  // まず直接パースを試みる
  try {
    return JSON.parse(normalizedText);
  } catch {
    // ignore
  }
  // テキスト内の最初の { から最後の } を抽出してパース
  // （コードブロック内に ``` が含まれる場合でも対応できる）
  const firstBrace = normalizedText.indexOf("{");
  const lastBrace = normalizedText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(normalizedText.slice(firstBrace, lastBrace + 1));
  }
  throw new SyntaxError("Failed to parse as JSON");
}

function parseStructuredItems(
  value: unknown,
): z.infer<typeof structuredOutputSchema>["items"] | null {
  const parsed = structuredOutputSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return parsed.data.items;
}

function parseItemsFromStructuredOutput(json: string | null): z.infer<typeof structuredOutputSchema>["items"] | null {
  const parsedStructuredOutput = parseStructuredOutput(json);
  if (parsedStructuredOutput === null) {
    return null;
  }

  return parseStructuredItems(parsedStructuredOutput);
}

function addLineNumbers(text: string): string {
  const lines = text.split("\n");
  const width = String(lines.length).length;
  return lines
    .map((line, index) => `${String(index + 1).padStart(width, " ")}: ${line}`)
    .join("\n");
}

function buildSystemPrompt(version: StoredPromptVersion, testCase: StoredTestCase): string {
  if (!testCase.context_content) {
    return version.content;
  }

  const numberedContext = addLineNumbers(testCase.context_content);

  if (version.content.includes("{{context}}")) {
    return version.content.replace("{{context}}", numberedContext);
  }

  return `${version.content}\n\n${numberedContext}`;
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
  const rawContext = params.testCase.context_content ?? "";
  const numberedContext = rawContext ? addLineNumbers(rawContext) : "";
  const effectiveContext = params.previousOutput ?? numberedContext;

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
  maxTokens: number | null;
}): { request: LLMRequest; conversationBase: ConversationMessage[] } | null {
  const maxTokens = params.maxTokens ?? undefined;
  if (params.messages.length > 0) {
    return {
      request: {
        model: params.model,
        messages: params.messages,
        systemPrompt: params.systemPrompt,
        temperature: params.temperature,
        ...(maxTokens !== undefined ? { maxTokens } : {}),
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
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    },
    conversationBase: fallbackMessages,
  };
}

function serializeRun(run: typeof runs.$inferSelect): Omit<
  typeof run,
  "project_id" | "conversation" | "execution_trace" | "structured_output"
> & {
  conversation: ConversationMessage[];
  execution_trace: ExecutionTraceStep[] | null;
  structured_output: StructuredOutput | null;
} {
  return {
    id: run.id,
    prompt_version_id: run.prompt_version_id,
    test_case_id: run.test_case_id,
    conversation: parseConversation(run.conversation),
    execution_trace: parseExecutionTrace(run.execution_trace),
    structured_output: parseStructuredOutput(run.structured_output),
    is_best: run.is_best,
    is_discarded: run.is_discarded,
    model: run.model,
    temperature: run.temperature,
    api_provider: run.api_provider,
    execution_profile_id: run.execution_profile_id,
    created_at: run.created_at,
  };
}

function serializeRunWithProjectId(run: typeof runs.$inferSelect, projectId: number) {
  return {
    ...serializeRun(run),
    project_id: projectId,
  };
}

function parseOptionalBooleanParam(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function parseProjectIdParam(c: {
  req: {
    param: (name: string) => string;
    query: (name: string) => string | undefined;
  };
}): number | null | undefined {
  const legacyProjectId = parseLegacyProjectId(c.req.param("projectId"));
  if (legacyProjectId !== null) {
    return legacyProjectId;
  }

  if (c.req.param("projectId") !== undefined) {
    return null;
  }

  return parseIntParam(c.req.query("project_id"));
}

function parseLegacyProjectId(value: string | undefined): number | null | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  return parseIntParam(value);
}

async function fetchRunById(db: DB, id: number): Promise<typeof runs.$inferSelect | null> {
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  return run ?? null;
}

async function fetchExecutionSettings(
  db: DB,
  params: {
    executionProfileId?: number;
    legacyProjectId?: number;
    legacySnapshot?: Partial<Pick<ExecutionSettings, "model" | "temperature" | "api_provider">>;
  },
): Promise<
  | { ok: true; settings: ExecutionSettings; executionProfileId: number | null }
  | { ok: false; status: 400 | 404; error: string }
> {
  if (params.executionProfileId !== undefined) {
    const [profile] = await db
      .select()
      .from(execution_profiles)
      .where(eq(execution_profiles.id, params.executionProfileId));

    if (!profile) {
      return { ok: false, status: 404, error: "Execution profile not found" };
    }

    return {
      ok: true,
      settings: {
        model: profile.model,
        temperature: profile.temperature,
        api_provider: profile.api_provider,
        max_tokens: profile.max_tokens,
      },
      executionProfileId: profile.id,
    };
  }

  if (
    params.legacySnapshot?.model !== undefined &&
    params.legacySnapshot.temperature !== undefined &&
    params.legacySnapshot.api_provider !== undefined
  ) {
    return {
      ok: true,
      settings: {
        model: params.legacySnapshot.model,
        temperature: params.legacySnapshot.temperature,
        api_provider: params.legacySnapshot.api_provider,
        max_tokens: null,
      },
      executionProfileId: null,
    };
  }

  if (params.legacyProjectId !== undefined) {
    const [projectSettings] = await db
      .select()
      .from(project_settings)
      .where(eq(project_settings.project_id, params.legacyProjectId));

    if (!projectSettings) {
      return { ok: false, status: 404, error: "Project settings not found" };
    }

    return {
      ok: true,
      settings: {
        model: projectSettings.model,
        temperature: projectSettings.temperature,
        api_provider: projectSettings.api_provider,
        max_tokens: projectSettings.max_tokens,
      },
      executionProfileId: null,
    };
  }

  return { ok: false, status: 400, error: "execution_profile_id is required" };
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
 * legacy project 紐づけは中間テーブルと旧 prompt_versions.project_id の両方を許容する。
 */
async function fetchVersionIdsByProject(db: DB, projectId: number): Promise<number[]> {
  const [links, directVersions] = await Promise.all([
    db
      .select({ prompt_version_id: prompt_version_projects.prompt_version_id })
      .from(prompt_version_projects)
      .where(eq(prompt_version_projects.project_id, projectId)),
    db
      .select({ prompt_version_id: prompt_versions.id })
      .from(prompt_versions)
      .where(eq(prompt_versions.project_id, projectId)),
  ]);

  return [...new Set([...links.map((l) => l.prompt_version_id), ...directVersions.map((v) => v.prompt_version_id)])];
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

async function hasLegacyProjectPromptVersion(
  db: DB,
  projectId: number,
  promptVersionId: number,
): Promise<boolean> {
  const [link] = await db
    .select({ prompt_version_id: prompt_version_projects.prompt_version_id })
    .from(prompt_version_projects)
    .where(
      and(
        eq(prompt_version_projects.prompt_version_id, promptVersionId),
        eq(prompt_version_projects.project_id, projectId),
      ),
    );

  if (link) {
    return true;
  }

  const [directVersion] = await db
    .select({ id: prompt_versions.id })
    .from(prompt_versions)
    .where(and(eq(prompt_versions.id, promptVersionId), eq(prompt_versions.project_id, projectId)));

  return directVersion !== undefined;
}

export function createRunsRouter(db: DB, options: RunsRouterOptions = {}) {
  const router = new Hono();
  const llmClientFactory = options.llmClientFactory ?? defaultLLMClientFactory;
  const enableCandidateExtractRoute = options.enableCandidateExtractRoute ?? true;

  // GET /api/runs - 新 Runs API
  // GET /api/projects/:projectId/runs - 旧API互換レイヤ
  router.get("/", async (c) => {
    const legacyProjectId = parseLegacyProjectId(c.req.param("projectId"));
    const queryProjectIdRaw = c.req.query("project_id");
    const queryProjectId = parseIntParam(queryProjectIdRaw);

    if (legacyProjectId === null || (queryProjectIdRaw !== undefined && queryProjectId === null)) {
      return c.json({ error: "Invalid projectId" }, 400);
    }
    const filterProjectId = legacyProjectId ?? queryProjectId ?? undefined;

    const promptVersionIdParam = c.req.query("prompt_version_id");
    const testCaseIdParam = c.req.query("test_case_id");
    const includeDiscardedParam = c.req.query("include_discarded");
    const includeDiscarded = parseOptionalBooleanParam(includeDiscardedParam);
    if (includeDiscarded === null && includeDiscardedParam !== undefined) {
      return c.json({ error: "Invalid include_discarded" }, 400);
    }

    const conditions = [
      ...(includeDiscarded === true ? [] : [eq(runs.is_discarded, false)]),
    ];

    if (filterProjectId !== undefined) {
      const versionIds = await fetchVersionIdsByProject(db, filterProjectId);
      if (versionIds.length === 0) {
        return c.json([]);
      }

      conditions.push(inArray(runs.prompt_version_id, versionIds));
    }

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
      result.map((run) =>
        legacyProjectId !== undefined
          ? serializeRunWithProjectId(run, legacyProjectId)
          : serializeRun(run),
      ),
    );
  });

  // POST /api/runs - 新 Runs API
  // POST /api/projects/:projectId/runs - 旧API互換レイヤ
  router.post("/", zValidator("json", legacyCreateRunSchema), async (c) => {
    const legacyProjectId = parseLegacyProjectId(c.req.param("projectId"));

    if (legacyProjectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");

    if (legacyProjectId !== undefined) {
      const hasVersionLink = await hasLegacyProjectPromptVersion(
        db,
        legacyProjectId,
        body.prompt_version_id,
      );

      if (!hasVersionLink) {
        return c.json({ error: "Prompt version not found in this project" }, 404);
      }
    }

    const legacySnapshot: Partial<Pick<ExecutionSettings, "model" | "temperature" | "api_provider">> =
      {};
    if (body.model !== undefined) legacySnapshot.model = body.model;
    if (body.temperature !== undefined) legacySnapshot.temperature = body.temperature;
    if (body.api_provider !== undefined) legacySnapshot.api_provider = body.api_provider;

    const resolvedSettings = await (async () => {
      if (
        legacyProjectId !== undefined &&
        body.execution_profile_id !== undefined &&
        legacySnapshot.model !== undefined &&
        legacySnapshot.temperature !== undefined &&
        legacySnapshot.api_provider !== undefined
      ) {
        const profileValidation = await fetchExecutionSettings(db, {
          executionProfileId: body.execution_profile_id,
        });
        if (!profileValidation.ok) {
          return profileValidation;
        }

        return {
          ok: true as const,
          settings: {
            model: legacySnapshot.model,
            temperature: legacySnapshot.temperature,
            api_provider: legacySnapshot.api_provider,
            max_tokens: null,
          },
          executionProfileId: profileValidation.executionProfileId,
        };
      }

      return fetchExecutionSettings(db, {
        ...(body.execution_profile_id !== undefined
          ? { executionProfileId: body.execution_profile_id }
          : {}),
        ...(legacyProjectId !== undefined ? { legacyProjectId } : {}),
        ...(Object.keys(legacySnapshot).length > 0 ? { legacySnapshot } : {}),
      });
    })();

    if (!resolvedSettings.ok) {
      return c.json({ error: resolvedSettings.error }, resolvedSettings.status);
    }

    const result = await db
      .insert(runs)
      .values({
        project_id: legacyProjectId ?? 0,
        prompt_version_id: body.prompt_version_id,
        test_case_id: body.test_case_id,
        conversation: JSON.stringify(body.conversation),
        execution_trace: body.execution_trace ? JSON.stringify(body.execution_trace) : null,
        structured_output:
          body.structured_output === undefined ? null : JSON.stringify(body.structured_output),
        is_best: false,
        is_discarded: false,
        model: resolvedSettings.settings.model,
        temperature: resolvedSettings.settings.temperature,
        api_provider: resolvedSettings.settings.api_provider,
        execution_profile_id: resolvedSettings.executionProfileId,
        created_at: Date.now(),
      })
      .returning();

    const created = result[0];
    if (!created) {
      return c.json({ error: "Failed to create Run" }, 500);
    }

    return c.json(
      legacyProjectId !== undefined
        ? serializeRunWithProjectId(created, legacyProjectId)
        : serializeRun(created),
      201,
    );
  });

  // POST /api/runs/execute - 新 Runs API
  // POST /api/projects/:projectId/runs/execute - 旧API互換レイヤ
  router.post("/execute", zValidator("json", legacyExecuteRunSchema), async (c) => {
    const legacyProjectId = parseLegacyProjectId(c.req.param("projectId"));

    if (legacyProjectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body: ExecuteRunBody = c.req.valid("json");

    if (legacyProjectId !== undefined) {
      const hasVersionLink = await hasLegacyProjectPromptVersion(
        db,
        legacyProjectId,
        body.prompt_version_id,
      );

      if (!hasVersionLink) {
        return c.json({ error: "Prompt version not found" }, 404);
      }

      const [testCaseLink] = await db
        .select()
        .from(test_case_projects)
        .where(
          and(
            eq(test_case_projects.test_case_id, body.test_case_id),
            eq(test_case_projects.project_id, legacyProjectId),
          ),
        );

      if (!testCaseLink) {
        return c.json({ error: "Test case not found" }, 404);
      }
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

    const resolvedSettings = await fetchExecutionSettings(db, {
      ...(body.execution_profile_id !== undefined
        ? { executionProfileId: body.execution_profile_id }
        : {}),
      ...(legacyProjectId !== undefined ? { legacyProjectId } : {}),
    });

    if (!resolvedSettings.ok) {
      return c.json({ error: resolvedSettings.error }, resolvedSettings.status);
    }

    const settings = resolvedSettings.settings;
    const resolvedExecutionProfileId = resolvedSettings.executionProfileId;

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
      maxTokens: settings.max_tokens,
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
                  maxTokens: settings.max_tokens,
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
                project_id: legacyProjectId ?? 0,
                prompt_version_id: body.prompt_version_id,
                test_case_id: body.test_case_id,
                conversation: JSON.stringify(conversation),
                execution_trace: executionTrace.length > 0 ? JSON.stringify(executionTrace) : null,
                structured_output:
                  body.structured_output === undefined
                    ? null
                    : JSON.stringify(body.structured_output),
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

            controller.enqueue(
              encodeSse(
                "run",
                legacyProjectId !== undefined
                  ? serializeRunWithProjectId(created, legacyProjectId)
                  : serializeRun(created),
              ),
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

  // GET /api/runs/:id - 新 Runs API
  // GET /api/projects/:projectId/runs/:id - 旧API互換レイヤ
  router.get("/:id", async (c) => {
    const id = parseIntParam(c.req.param("id"));
    const legacyProjectId = parseLegacyProjectId(c.req.param("projectId"));

    if (legacyProjectId === null || id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const run =
      legacyProjectId !== undefined
        ? await (async () => {
            const versionIds = await fetchVersionIdsByProject(db, legacyProjectId);
            if (versionIds.length === 0) return null;
            return (
              await db
                .select()
                .from(runs)
                .where(
                  and(
                    eq(runs.id, id),
                    eq(runs.project_id, legacyProjectId),
                    inArray(runs.prompt_version_id, versionIds),
                  ),
                )
            )[0] ?? null;
          })()
        : await fetchRunById(db, id);

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return c.json(
      legacyProjectId !== undefined
        ? serializeRunWithProjectId(run, legacyProjectId)
        : serializeRun(run),
    );
  });

  // PATCH /api/runs/:id/best - 新 Runs API
  // PATCH /api/projects/:projectId/runs/:id/best - 旧API互換レイヤ
  // バージョン×テストケースごとに1件のみ設定できる（既存フラグは自動解除）
  // { unset: true } を渡すと解除のみ行う
  router.patch("/:id/best", async (c) => {
    const id = parseIntParam(c.req.param("id"));
    const legacyProjectId = parseLegacyProjectId(c.req.param("projectId"));

    if (legacyProjectId === null || id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const versionIds =
      legacyProjectId !== undefined ? await fetchVersionIdsByProject(db, legacyProjectId) : null;

    if (legacyProjectId !== undefined && versionIds !== null && versionIds.length === 0) {
      return c.json({ error: "Run not found" }, 404);
    }

    const [existing] = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.id, id),
          ...(legacyProjectId !== undefined ? [eq(runs.project_id, legacyProjectId)] : []),
          ...(versionIds !== null ? [inArray(runs.prompt_version_id, versionIds)] : []),
        ),
      );

    if (!existing) {
      return c.json({ error: "Run not found" }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as { unset?: boolean };

    if (body.unset) {
      // ベスト解除
      const updateResult = await db
        .update(runs)
        .set({ is_best: false })
        .where(
          and(
            eq(runs.id, id),
            ...(legacyProjectId !== undefined ? [eq(runs.project_id, legacyProjectId)] : []),
          ),
        )
        .returning();
      const updated = updateResult[0];
      if (!updated) return c.json({ error: "Failed to update Run" }, 500);
      return c.json(
        legacyProjectId !== undefined
          ? serializeRunWithProjectId(updated, legacyProjectId)
          : serializeRun(updated),
      );
    }

    // 同一 prompt_version_id × test_case_id の既存フラグを解除
    await db
      .update(runs)
      .set({ is_best: false })
      .where(
        and(
          eq(runs.prompt_version_id, existing.prompt_version_id),
          eq(runs.test_case_id, existing.test_case_id),
          ...(legacyProjectId !== undefined ? [eq(runs.project_id, legacyProjectId)] : []),
        ),
      );

    // 対象Runにベスト回答フラグを設定
    const updateResult = await db
      .update(runs)
      .set({ is_best: true })
      .where(
        and(
          eq(runs.id, id),
          ...(legacyProjectId !== undefined ? [eq(runs.project_id, legacyProjectId)] : []),
        ),
      )
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update Run" }, 500);
    }

    return c.json(
      legacyProjectId !== undefined
        ? serializeRunWithProjectId(updated, legacyProjectId)
        : serializeRun(updated),
    );
  });

  // POST /api/projects/:projectId/runs/:id/candidates/extract - annotation_candidates を抽出して保存
  if (enableCandidateExtractRoute) {
    router.post("/:id/candidates/extract", async (c) => {
      const projectId = parseIntParam(c.req.param("projectId"));
      const id = parseIntParam(c.req.param("id"));

      if (projectId === null || id === null) {
        return c.json({ error: "Invalid ID" }, 400);
      }

      let body: z.infer<typeof extractCandidatesSchema>;
      try {
        body = (await c.req.json()) as z.infer<typeof extractCandidatesSchema>;
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }

      const parsedBody = extractCandidatesSchema.safeParse(body);
      if (!parsedBody.success) {
        return c.json(
          { error: parsedBody.error.issues[0]?.message ?? "Invalid request body" },
          400,
        );
      }
      const { annotation_task_id, source_type, source_step_id } = parsedBody.data;

      // run が存在し、該当プロジェクトに属することを確認
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

      // annotation_task が存在することを確認
      const [task] = await db
        .select()
        .from(annotation_tasks)
        .where(eq(annotation_tasks.id, annotation_task_id));

      if (!task) {
        return c.json({ error: "Annotation task not found" }, 404);
      }

      // annotation_task に紐づく有効な label keys を取得
      const labels = await db
        .select({ key: annotation_labels.key })
        .from(annotation_labels)
        .where(eq(annotation_labels.annotation_task_id, annotation_task_id));
      const validLabelKeys = new Set(labels.map((l) => l.key));

      // ソースタイプ決定とアイテム抽出
      let sourceType: CandidateSourceType;
      let resolvedSourceStepId: string | null = null;
      let items: z.infer<typeof structuredOutputSchema>["items"] | null = null;
      const requestedSourceType =
        source_type ?? (run.structured_output !== null ? "structured_json" : "final_answer");

      if (requestedSourceType === "structured_json") {
        sourceType = "structured_json";
        const parsedItems = parseItemsFromStructuredOutput(run.structured_output);
        if (parsedItems === null) {
          return c.json({ error: "structured_output is not available for this run" }, 400);
        }
        items = parsedItems;
      } else if (requestedSourceType === "final_answer") {
        sourceType = "final_answer";
        const conversation = parseConversation(run.conversation);
        const lastAssistantMessage = [...conversation]
          .reverse()
          .find((m) => m.role === "assistant");
        if (!lastAssistantMessage) {
          return c.json({ error: "No assistant message found in conversation" }, 400);
        }

        let parsedFinalAnswer: unknown;
        try {
          parsedFinalAnswer = extractJsonFromText(lastAssistantMessage.content);
        } catch {
          const fallbackItems = parseItemsFromStructuredOutput(run.structured_output);
          if (fallbackItems !== null) {
            sourceType = "structured_json";
            items = fallbackItems;
          } else {
            return c.json({ error: "Failed to parse assistant message as JSON" }, 400);
          }
        }
        if (items === null) {
          const parsedItems = parseStructuredItems(parsedFinalAnswer);
          if (parsedItems === null) {
            const fallbackItems = parseItemsFromStructuredOutput(run.structured_output);
            if (fallbackItems !== null) {
              sourceType = "structured_json";
              items = fallbackItems;
            } else {
              return c.json(
                {
                  error:
                    "Assistant message JSON has invalid format (missing items field or invalid schema)",
                },
                400,
              );
            }
          } else {
            items = parsedItems;
          }
        }
      } else {
        sourceType = "trace_step";
        resolvedSourceStepId = source_step_id ?? null;

        const executionTrace = parseExecutionTrace(run.execution_trace);
        if (executionTrace === null) {
          return c.json({ error: "execution_trace is not available for this run" }, 400);
        }

        const traceStep = executionTrace.find((step) => step.id === source_step_id);
        if (!traceStep) {
          return c.json({ error: `Trace step "${source_step_id}" not found` }, 400);
        }

        let parsedTraceStepOutput: unknown;
        try {
          parsedTraceStepOutput = JSON.parse(traceStep.output);
        } catch {
          return c.json({ error: "Failed to parse trace_step output as JSON" }, 400);
        }

        const parsedItems = parseStructuredItems(parsedTraceStepOutput);
        if (parsedItems === null) {
          return c.json({ error: "trace_step output has invalid format" }, 400);
        }
        items = parsedItems;
      }

      if (items === null) {
        return c.json({ error: "Failed to resolve annotation candidate items" }, 500);
      }

      // label の存在チェック
      for (const item of items) {
        if (!validLabelKeys.has(item.label)) {
          return c.json(
            { error: `Label "${item.label}" is not valid for this annotation task` },
            400,
          );
        }
      }

      // line range チェック
      for (const item of items) {
        if (item.start_line > item.end_line) {
          return c.json(
            {
              error: `start_line (${item.start_line}) must not be greater than end_line (${item.end_line})`,
            },
            400,
          );
        }
      }

      // 重複チェック: 同一 run / task / source からの重複取り込みを防ぐ
      const [existing] = await db
        .select({ id: annotation_candidates.id })
        .from(annotation_candidates)
        .where(
          and(
            eq(annotation_candidates.run_id, id),
            eq(annotation_candidates.annotation_task_id, annotation_task_id),
            eq(annotation_candidates.source_type, sourceType),
          ),
        );

      if (existing) {
        return c.json(
          { error: "Candidates already extracted for this run/task/source combination" },
          409,
        );
      }

      const targetTextRef = `test_case:${run.test_case_id}`;
      const now = Date.now();

      const inserted = await db
        .insert(annotation_candidates)
        .values(
          items.map((item) => ({
            run_id: id,
            annotation_task_id,
            target_text_ref: targetTextRef,
            source_type: sourceType,
            source_step_id: resolvedSourceStepId,
            label: item.label,
            start_line: item.start_line,
            end_line: item.end_line,
            quote: item.quote,
            rationale: item.rationale ?? null,
            status: "pending" as const,
            note: null,
            created_at: now,
            updated_at: now,
          })),
        )
        .returning();

      return c.json(
        {
          candidates_created: inserted.length,
          run_id: id,
          annotation_task_id,
        },
        201,
      );
    });
  }

  // PATCH /api/runs/:id/discard - 新 Runs API
  // PATCH /api/projects/:projectId/runs/:id/discard - 旧API互換レイヤ
  router.patch("/:id/discard", async (c) => {
    const id = parseIntParam(c.req.param("id"));
    const legacyProjectId = parseLegacyProjectId(c.req.param("projectId"));

    if (legacyProjectId === null || id === null) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const versionIds =
      legacyProjectId !== undefined ? await fetchVersionIdsByProject(db, legacyProjectId) : null;

    if (legacyProjectId !== undefined && versionIds !== null && versionIds.length === 0) {
      return c.json({ error: "Run not found" }, 404);
    }

    const [existing] = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.id, id),
          ...(legacyProjectId !== undefined ? [eq(runs.project_id, legacyProjectId)] : []),
          ...(versionIds !== null ? [inArray(runs.prompt_version_id, versionIds)] : []),
        ),
      );

    if (!existing) {
      return c.json({ error: "Run not found" }, 404);
    }

    const updateResult = await db
      .update(runs)
      .set({ is_discarded: true })
      .where(
        and(
          eq(runs.id, id),
          ...(legacyProjectId !== undefined ? [eq(runs.project_id, legacyProjectId)] : []),
        ),
      )
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      return c.json({ error: "Failed to update Run" }, 500);
    }

    return c.json(
      legacyProjectId !== undefined
        ? serializeRunWithProjectId(updated, legacyProjectId)
        : serializeRun(updated),
    );
  });

  return router;
}
