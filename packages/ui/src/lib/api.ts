const API_BASE_URL = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(response.status, `API error: ${response.status} ${response.statusText}`);
  }

  if (response.status === 204 || response.headers.get("Content-Length") === "0") {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return fetchJson<T>(path);
  },

  post<T>(path: string, body: unknown): Promise<T> {
    return fetchJson<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  put<T>(path: string, body: unknown): Promise<T> {
    return fetchJson<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  patch<T>(path: string, body: unknown): Promise<T> {
    return fetchJson<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  delete<T>(path: string): Promise<T> {
    return fetchJson<T>(path, { method: "DELETE" });
  },
};

export type HealthResponse = {
  status: string;
};

export function getHealth(): Promise<HealthResponse> {
  return api.get<HealthResponse>("/health");
}

export type Project = {
  id: number;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
};

export function getProjects(): Promise<Project[]> {
  return api.get<Project[]>("/projects");
}

export function getProject(id: number): Promise<Project> {
  return api.get<Project>(`/projects/${id}`);
}

export type ContextFileSummary = {
  name: string;
  path: string;
  mime_type: string;
  size: number;
  updated_at: number;
};

export type ContextFileDetail = ContextFileSummary & {
  content: string;
};

export function getContextFiles(projectId: number): Promise<ContextFileSummary[]> {
  return api.get<ContextFileSummary[]>(`/projects/${projectId}/context-files`);
}

export function getContextFile(projectId: number, filePath: string): Promise<ContextFileDetail> {
  const params = new URLSearchParams({ path: filePath });
  return api.get<ContextFileDetail>(`/projects/${projectId}/context-files/content?${params}`);
}

export function uploadContextFile(
  projectId: number,
  data: { file_name: string; content: string; mime_type?: string },
): Promise<ContextFileSummary> {
  return api.post<ContextFileSummary>(`/projects/${projectId}/context-files`, data);
}

export function updateContextFile(
  projectId: number,
  filePath: string,
  data: { content: string },
): Promise<ContextFileDetail> {
  const params = new URLSearchParams({ path: filePath });
  return api.put<ContextFileDetail>(`/projects/${projectId}/context-files/content?${params}`, data);
}

export function createProject(data: {
  name: string;
  description?: string;
}): Promise<Project> {
  return api.post<Project>("/projects", data);
}

export function deleteProject(id: number): Promise<void> {
  return api.delete<void>(`/projects/${id}`);
}

// PromptVersion
export type PromptVersion = {
  id: number;
  project_id: number;
  version: number;
  name: string | null;
  memo: string | null;
  content: string;
  workflow_definition: PromptWorkflowDefinition | null;
  parent_version_id: number | null;
  created_at: number;
  is_selected: boolean;
};

export type PromptExecutionStepDefinition = {
  id: string;
  title: string;
  prompt: string;
};

export type PromptWorkflowDefinition = {
  steps: PromptExecutionStepDefinition[];
};

export function getPromptVersions(projectId: number): Promise<PromptVersion[]> {
  return api.get<PromptVersion[]>(`/projects/${projectId}/prompt-versions`);
}

export function getPromptVersion(projectId: number, id: number): Promise<PromptVersion> {
  return api.get<PromptVersion>(`/projects/${projectId}/prompt-versions/${id}`);
}

export function createPromptVersion(
  projectId: number,
  data: {
    content: string;
    name?: string;
    memo?: string;
    workflow_definition?: PromptWorkflowDefinition;
  },
): Promise<PromptVersion> {
  return api.post<PromptVersion>(`/projects/${projectId}/prompt-versions`, data);
}

export function updatePromptVersion(
  projectId: number,
  id: number,
  data: {
    content?: string;
    name?: string | null;
    memo?: string | null;
    workflow_definition?: PromptWorkflowDefinition | null;
  },
): Promise<PromptVersion> {
  return api.patch<PromptVersion>(`/projects/${projectId}/prompt-versions/${id}`, data);
}

export function branchPromptVersion(
  projectId: number,
  id: number,
  data: { name?: string; memo?: string },
): Promise<PromptVersion> {
  return api.post<PromptVersion>(`/projects/${projectId}/prompt-versions/${id}/branch`, data);
}

// TestCase API

export type Turn = {
  role: "user" | "assistant";
  content: string;
};

export type TestCase = {
  id: number;
  project_id: number;
  title: string;
  turns: Turn[];
  context_content: string;
  expected_description: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
};

export function getTestCases(projectId: number): Promise<TestCase[]> {
  return api.get<TestCase[]>(`/projects/${projectId}/test-cases`);
}

export function getTestCase(projectId: number, id: number): Promise<TestCase> {
  return api.get<TestCase>(`/projects/${projectId}/test-cases/${id}`);
}

export function createTestCase(
  projectId: number,
  data: {
    title: string;
    turns?: Turn[];
    context_content?: string;
    expected_description?: string;
    display_order?: number;
  },
): Promise<TestCase> {
  return api.post<TestCase>(`/projects/${projectId}/test-cases`, data);
}

export function updateTestCase(
  projectId: number,
  id: number,
  data: {
    title?: string;
    turns?: Turn[];
    context_content?: string;
    expected_description?: string | null;
    display_order?: number;
  },
): Promise<TestCase> {
  return api.patch<TestCase>(`/projects/${projectId}/test-cases/${id}`, data);
}

export function deleteTestCase(projectId: number, id: number): Promise<void> {
  return api.delete<void>(`/projects/${projectId}/test-cases/${id}`);
}

// Run API

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ExecutionTraceStep = {
  id: string;
  title: string;
  prompt: string;
  renderedPrompt: string;
  inputConversation: ConversationMessage[];
  output: string;
};

export type Run = {
  id: number;
  project_id: number;
  prompt_version_id: number;
  test_case_id: number;
  conversation: ConversationMessage[];
  execution_trace: ExecutionTraceStep[] | null;
  is_best: boolean;
  is_discarded: boolean;
  model: string;
  temperature: number;
  api_provider: string;
  created_at: number;
};

export function getRuns(
  projectId: number,
  filters?: { prompt_version_id?: number; test_case_id?: number },
): Promise<Run[]> {
  const params = new URLSearchParams();
  if (filters?.prompt_version_id !== undefined) {
    params.set("prompt_version_id", String(filters.prompt_version_id));
  }
  if (filters?.test_case_id !== undefined) {
    params.set("test_case_id", String(filters.test_case_id));
  }
  const query = params.toString();
  const path = query ? `/projects/${projectId}/runs?${query}` : `/projects/${projectId}/runs`;
  return api.get<Run[]>(path);
}

export function getRun(projectId: number, id: number): Promise<Run> {
  return api.get<Run>(`/projects/${projectId}/runs/${id}`);
}

export function createRun(
  projectId: number,
  data: {
    prompt_version_id: number;
    test_case_id: number;
    conversation: ConversationMessage[];
    execution_trace?: ExecutionTraceStep[];
    model: string;
    temperature: number;
    api_provider: string;
  },
): Promise<Run> {
  return api.post<Run>(`/projects/${projectId}/runs`, data);
}

type ExecuteRunStreamOptions = {
  prompt_version_id: number;
  test_case_id: number;
  api_key: string;
  onDelta: (text: string) => void;
  onStepStart?: (step: Omit<ExecutionTraceStep, "output">) => void;
  onStepDelta?: (input: { id: string; title: string; text: string }) => void;
  onStepComplete?: (step: ExecutionTraceStep) => void;
};

type RunExecuteEvent =
  | {
      event: "delta";
      data: { text: string };
    }
  | {
      event: "run";
      data: Run;
    }
  | {
      event: "step-start";
      data: Omit<ExecutionTraceStep, "output">;
    }
  | {
      event: "step-delta";
      data: { id: string; title: string; text: string };
    }
  | {
      event: "step-complete";
      data: ExecutionTraceStep;
    }
  | {
      event: "error";
      data: { status?: number; message?: string };
    };

function parseSseEvent(chunk: string): RunExecuteEvent | null {
  const lines = chunk.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLine = lines.find((line) => line.startsWith("data: "));

  if (!eventLine || !dataLine) {
    return null;
  }

  const event = eventLine.slice("event: ".length) as RunExecuteEvent["event"];
  const data = JSON.parse(dataLine.slice("data: ".length)) as RunExecuteEvent["data"];

  if (
    event === "delta" ||
    event === "run" ||
    event === "step-start" ||
    event === "step-delta" ||
    event === "step-complete" ||
    event === "error"
  ) {
    return { event, data } as RunExecuteEvent;
  }

  return null;
}

export async function executeRunStream(
  projectId: number,
  options: ExecuteRunStreamOptions,
): Promise<Run> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/runs/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt_version_id: options.prompt_version_id,
      test_case_id: options.test_case_id,
      api_key: options.api_key,
    }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, `API error: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new ApiError(502, "API error: empty streaming response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let savedRun: Run | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
    }

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const parsed = parseSseEvent(chunk.trim());
      if (!parsed) continue;

      if (parsed.event === "delta") {
        options.onDelta(parsed.data.text);
      }

      if (parsed.event === "step-start") {
        options.onStepStart?.(parsed.data);
      }

      if (parsed.event === "step-delta") {
        options.onStepDelta?.(parsed.data);
      }

      if (parsed.event === "step-complete") {
        options.onStepComplete?.(parsed.data);
      }

      if (parsed.event === "run") {
        savedRun = parsed.data;
      }

      if (parsed.event === "error") {
        throw new ApiError(
          parsed.data.status ?? 502,
          parsed.data.message ?? "Run execution failed",
        );
      }
    }

    if (done) {
      break;
    }
  }

  if (!savedRun) {
    throw new ApiError(502, "API error: run was not returned");
  }

  return savedRun;
}

export function setBestRun(projectId: number, id: number, unset = false): Promise<Run> {
  return api.patch<Run>(`/projects/${projectId}/runs/${id}/best`, { unset });
}

export function discardRun(projectId: number, id: number): Promise<Run> {
  return api.patch<Run>(`/projects/${projectId}/runs/${id}/discard`, {});
}

export function setSelectedVersion(projectId: number, id: number): Promise<PromptVersion> {
  return api.patch<PromptVersion>(`/projects/${projectId}/prompt-versions/${id}/selected`, {});
}

// Score API

export type Score = {
  id: number;
  run_id: number;
  human_score: number | null;
  human_comment: string | null;
  judge_score: number | null;
  judge_reason: string | null;
  is_discarded: boolean;
  created_at: number;
  updated_at: number;
};

export function getScore(runId: number): Promise<Score> {
  return api.get<Score>(`/runs/${runId}/score`);
}

export function createScore(
  runId: number,
  data: { human_score?: number; human_comment?: string },
): Promise<Score> {
  return api.post<Score>(`/runs/${runId}/score`, data);
}

export function updateScore(
  runId: number,
  data: {
    human_score?: number | null;
    human_comment?: string | null;
    is_discarded?: boolean;
  },
): Promise<Score> {
  return api.patch<Score>(`/runs/${runId}/score`, data);
}

export function upsertScore(
  runId: number,
  data: {
    human_score?: number | null;
    human_comment?: string | null;
    is_discarded?: boolean;
  },
  hasScore: boolean,
): Promise<Score> {
  if (hasScore) {
    return updateScore(runId, data);
  }
  return createScore(runId, {
    human_score: data.human_score ?? undefined,
    human_comment: data.human_comment ?? undefined,
  });
}

// ProjectSettings API

export type ProjectSettings = {
  id: number;
  project_id: number;
  model: string;
  temperature: number;
  api_provider: "anthropic" | "openai";
  created_at: number;
  updated_at: number;
};

export type ApiProvider = "anthropic" | "openai";

export type LLMModelOption = {
  id: string;
  displayName: string;
  createdAt?: string;
};

export function getProjectSettings(projectId: number): Promise<ProjectSettings> {
  return api.get<ProjectSettings>(`/projects/${projectId}/settings`);
}

export function upsertProjectSettings(
  projectId: number,
  data: { model: string; temperature: number; api_provider: ApiProvider },
): Promise<ProjectSettings> {
  return api.put<ProjectSettings>(`/projects/${projectId}/settings`, data);
}

export function listProjectSettingsModels(
  projectId: number,
  data: { api_provider: ApiProvider; api_key: string },
): Promise<{ models: LLMModelOption[] }> {
  return api.post<{ models: LLMModelOption[] }>(`/projects/${projectId}/settings/models`, data);
}

// Score Progression API

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

export function getScoreProgression(projectId: number): Promise<ScoreProgressionResponse> {
  return api.get<ScoreProgressionResponse>(`/projects/${projectId}/score-progression`);
}
