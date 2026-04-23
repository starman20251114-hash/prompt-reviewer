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
    let message = `API error: ${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, message);
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

export type AnnotationOutputMode = "span_label";

export type AnnotationTask = {
  id: number;
  name: string;
  description: string | null;
  output_mode: AnnotationOutputMode;
  created_at: number;
  updated_at: number;
};

export type AnnotationLabel = {
  id: number;
  annotation_task_id: number;
  key: string;
  name: string;
  color: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
};

export type AnnotationTaskDetail = AnnotationTask & {
  labels: AnnotationLabel[];
};

export function getAnnotationTasks(): Promise<AnnotationTask[]> {
  return api.get<AnnotationTask[]>("/annotation-tasks");
}

export function getAnnotationTask(id: number): Promise<AnnotationTaskDetail> {
  return api.get<AnnotationTaskDetail>(`/annotation-tasks/${id}`);
}

export function createAnnotationTask(data: {
  name: string;
  description?: string;
  output_mode: AnnotationOutputMode;
}): Promise<AnnotationTask> {
  return api.post<AnnotationTask>("/annotation-tasks", data);
}

export function updateAnnotationTask(
  id: number,
  data: { name?: string; description?: string | null },
): Promise<AnnotationTask> {
  return api.patch<AnnotationTask>(`/annotation-tasks/${id}`, data);
}

export function deleteAnnotationTask(id: number): Promise<void> {
  return api.delete<void>(`/annotation-tasks/${id}`);
}

export function createAnnotationLabel(
  taskId: number,
  data: {
    key: string;
    name: string;
    color?: string;
    display_order?: number;
  },
): Promise<AnnotationLabel> {
  return api.post<AnnotationLabel>(`/annotation-tasks/${taskId}/labels`, data);
}

export function updateAnnotationLabel(
  id: number,
  data: {
    key?: string;
    name?: string;
    color?: string | null;
    display_order?: number;
  },
): Promise<AnnotationLabel> {
  return api.patch<AnnotationLabel>(`/annotation-labels/${id}`, data);
}

export function deleteAnnotationLabel(id: number): Promise<void> {
  return api.delete<void>(`/annotation-labels/${id}`);
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
  prompt_family_id: number;
  project_id: number | null;
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

export type PromptFamily = {
  id: number;
  name: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
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

export function getPromptFamilies(): Promise<PromptFamily[]> {
  return api.get<PromptFamily[]>("/prompt-families");
}

export function getPromptFamily(id: number): Promise<PromptFamily> {
  return api.get<PromptFamily>(`/prompt-families/${id}`);
}

export function createPromptFamily(data: {
  name?: string | null;
  description?: string | null;
}): Promise<PromptFamily> {
  return api.post<PromptFamily>("/prompt-families", data);
}

export function updatePromptFamily(
  id: number,
  data: {
    name?: string | null;
    description?: string | null;
  },
): Promise<PromptFamily> {
  return api.patch<PromptFamily>(`/prompt-families/${id}`, data);
}

export function deletePromptFamily(id: number): Promise<void> {
  return api.delete<void>(`/prompt-families/${id}`);
}

export function getPromptVersionsByFamily(promptFamilyId: number): Promise<PromptVersion[]> {
  const params = new URLSearchParams({ prompt_family_id: String(promptFamilyId) });
  return api.get<PromptVersion[]>(`/prompt-versions?${params}`);
}

export function getIndependentPromptVersion(id: number): Promise<PromptVersion> {
  return api.get<PromptVersion>(`/prompt-versions/${id}`);
}

export function createIndependentPromptVersion(data: {
  prompt_family_id: number;
  content: string;
  name?: string;
  memo?: string;
  workflow_definition?: PromptWorkflowDefinition;
}): Promise<PromptVersion> {
  return api.post<PromptVersion>("/prompt-versions", data);
}

export function updateIndependentPromptVersion(
  id: number,
  data: {
    content?: string;
    name?: string | null;
    memo?: string | null;
    workflow_definition?: PromptWorkflowDefinition | null;
  },
): Promise<PromptVersion> {
  return api.patch<PromptVersion>(`/prompt-versions/${id}`, data);
}

export function branchIndependentPromptVersion(
  id: number,
  data: { name?: string; memo?: string },
): Promise<PromptVersion> {
  return api.post<PromptVersion>(`/prompt-versions/${id}/branch`, data);
}

export function setSelectedIndependentPromptVersion(id: number): Promise<PromptVersion> {
  return api.patch<PromptVersion>(`/prompt-versions/${id}/selected`, {});
}

export function setPromptVersionProjects(
  id: number,
  data: { project_id: number | null },
): Promise<PromptVersion> {
  return api.put<PromptVersion>(`/prompt-versions/${id}/projects`, data);
}

// TestCase API

export type Turn = {
  role: "user" | "assistant";
  content: string;
};

export type TestCase = {
  id: number;
  title: string;
  turns: Turn[];
  context_content: string;
  expected_description: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
};

export type TestCaseFilters = {
  q?: string;
  project_id?: number;
  unclassified?: boolean;
};

export function getTestCases(projectId: number): Promise<TestCase[]> {
  const params = new URLSearchParams({ project_id: String(projectId) });
  return api.get<TestCase[]>(`/test-cases?${params}`);
}

export function getTestCase(projectId: number, id: number): Promise<TestCase> {
  void projectId;
  return api.get<TestCase>(`/test-cases/${id}`);
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
  return api.post<TestCase>("/test-cases", {
    ...data,
    project_ids: [projectId],
  });
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
  void projectId;
  return api.patch<TestCase>(`/test-cases/${id}`, data);
}

export function deleteTestCase(projectId: number, id: number): Promise<void> {
  void projectId;
  return api.delete<void>(`/test-cases/${id}`);
}

export function getIndependentTestCases(filters?: TestCaseFilters): Promise<TestCase[]> {
  const params = new URLSearchParams();
  if (filters?.q) {
    params.set("q", filters.q);
  }
  if (filters?.project_id !== undefined) {
    params.set("project_id", String(filters.project_id));
  }
  if (filters?.unclassified !== undefined) {
    params.set("unclassified", String(filters.unclassified));
  }
  const query = params.toString();
  return api.get<TestCase[]>(query ? `/test-cases?${query}` : "/test-cases");
}

export function getIndependentTestCase(id: number): Promise<TestCase> {
  return api.get<TestCase>(`/test-cases/${id}`);
}

export function createIndependentTestCase(data: {
  title: string;
  turns?: Turn[];
  context_content?: string;
  expected_description?: string;
  display_order?: number;
  project_ids?: number[];
}): Promise<TestCase> {
  return api.post<TestCase>("/test-cases", data);
}

export function updateIndependentTestCase(
  id: number,
  data: {
    title?: string;
    turns?: Turn[];
    context_content?: string;
    expected_description?: string | null;
    display_order?: number;
  },
): Promise<TestCase> {
  return api.patch<TestCase>(`/test-cases/${id}`, data);
}

export function deleteIndependentTestCase(id: number): Promise<void> {
  return api.delete<void>(`/test-cases/${id}`);
}

export function setTestCaseProjects(
  id: number,
  data: { project_ids: number[] },
): Promise<TestCase> {
  return api.put<TestCase>(`/test-cases/${id}/projects`, data);
}

export function setTestCaseContextAssets(
  id: number,
  data: { context_asset_ids: number[] },
): Promise<TestCase> {
  return api.put<TestCase>(`/test-cases/${id}/context-assets`, data);
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

export type StructuredOutputItem = {
  label: string;
  start_line: number;
  end_line: number;
  quote: string;
  rationale?: string;
};

export type StructuredOutput = {
  items: StructuredOutputItem[];
};

export type Run = {
  id: number;
  project_id: number | null;
  prompt_version_id: number;
  test_case_id: number;
  conversation: ConversationMessage[];
  execution_trace: ExecutionTraceStep[] | null;
  structured_output: StructuredOutput | null;
  is_best: boolean;
  is_discarded: boolean;
  model: string;
  temperature: number;
  api_provider: string;
  execution_profile_id: number | null;
  created_at: number;
};

export type RunFilters = {
  prompt_version_id?: number;
  test_case_id?: number;
  project_id?: number;
  include_discarded?: boolean;
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
    structured_output?: StructuredOutput | null;
    execution_profile_id?: number;
    model?: string;
    temperature?: number;
    api_provider?: string;
  },
): Promise<Run> {
  return api.post<Run>(`/projects/${projectId}/runs`, data);
}

type ExecuteRunStreamOptions = {
  prompt_version_id: number;
  test_case_id: number;
  api_key: string;
  execution_profile_id?: number;
  structured_output?: StructuredOutput | null;
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
      execution_profile_id: options.execution_profile_id,
      structured_output: options.structured_output,
    }),
  });

  if (!response.ok) {
    let message = `API error: ${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore JSON parse errors and keep the HTTP status text
    }
    throw new ApiError(response.status, message);
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

export function getRunIndependent(id: number): Promise<Run> {
  return api.get<Run>(`/runs/${id}`);
}

export function getRunsIndependent(filters?: RunFilters): Promise<Run[]> {
  const params = new URLSearchParams();
  if (filters?.prompt_version_id !== undefined) {
    params.set("prompt_version_id", String(filters.prompt_version_id));
  }
  if (filters?.test_case_id !== undefined) {
    params.set("test_case_id", String(filters.test_case_id));
  }
  if (filters?.project_id !== undefined) {
    params.set("project_id", String(filters.project_id));
  }
  if (filters?.include_discarded !== undefined) {
    params.set("include_discarded", String(filters.include_discarded));
  }
  const query = params.toString();
  return api.get<Run[]>(query ? `/runs?${query}` : "/runs");
}

export function createRunIndependent(data: {
  prompt_version_id: number;
  test_case_id: number;
  conversation: ConversationMessage[];
  execution_trace?: ExecutionTraceStep[];
  structured_output?: StructuredOutput | null;
  execution_profile_id: number;
}): Promise<Run> {
  return api.post<Run>("/runs", data);
}

type ExecuteRunStreamIndependentOptions = {
  prompt_version_id: number;
  test_case_id: number;
  api_key: string;
  execution_profile_id: number;
  structured_output?: StructuredOutput | null;
  onDelta: (text: string) => void;
  onStepStart?: (step: Omit<ExecutionTraceStep, "output">) => void;
  onStepDelta?: (input: { id: string; title: string; text: string }) => void;
  onStepComplete?: (step: ExecutionTraceStep) => void;
};

export async function executeRunStreamIndependent(
  options: ExecuteRunStreamIndependentOptions,
): Promise<Run> {
  const response = await fetch(`${API_BASE_URL}/runs/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt_version_id: options.prompt_version_id,
      test_case_id: options.test_case_id,
      api_key: options.api_key,
      execution_profile_id: options.execution_profile_id,
      structured_output: options.structured_output,
    }),
  });

  if (!response.ok) {
    let message = `API error: ${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
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

export function setBestRunIndependent(id: number, unset = false): Promise<Run> {
  return api.patch<Run>(`/runs/${id}/best`, { unset });
}

export function discardRunIndependent(id: number): Promise<Run> {
  return api.patch<Run>(`/runs/${id}/discard`, {});
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
  max_tokens: number | null;
  created_at: number;
  updated_at: number;
};

export type ApiProvider = "anthropic" | "openai";

export type LLMModelOption = {
  id: string;
  displayName: string;
  createdAt?: string;
};

export type ExecutionProfile = {
  id: number;
  name: string;
  description: string | null;
  model: string;
  temperature: number;
  api_provider: ApiProvider;
  max_tokens: number | null;
  created_at: number;
  updated_at: number;
};

export type ContextAssetSummary = {
  id: number;
  name: string;
  path: string;
  mime_type: string;
  content_hash: string;
  created_at: number;
  updated_at: number;
};

export type ContextAssetDetail = ContextAssetSummary & {
  content: string;
  project_ids: number[];
};

export type ContextAssetFilters = {
  q?: string;
  project_id?: number;
  unclassified?: boolean;
  linked_to?: `test_case:${number}` | `prompt_family:${number}`;
};

export function getProjectSettings(projectId: number): Promise<ProjectSettings> {
  return api.get<ProjectSettings>(`/projects/${projectId}/settings`);
}

export function upsertProjectSettings(
  projectId: number,
  data: {
    model: string;
    temperature: number;
    api_provider: ApiProvider;
    max_tokens: number | null;
  },
): Promise<ProjectSettings> {
  return api.put<ProjectSettings>(`/projects/${projectId}/settings`, data);
}

export function listProjectSettingsModels(
  projectId: number,
  data: { api_provider: ApiProvider; api_key: string },
): Promise<{ models: LLMModelOption[] }> {
  return api.post<{ models: LLMModelOption[] }>(`/projects/${projectId}/settings/models`, data);
}

export function getExecutionProfiles(): Promise<ExecutionProfile[]> {
  return api.get<ExecutionProfile[]>("/execution-profiles");
}

export function getExecutionProfile(id: number): Promise<ExecutionProfile> {
  return api.get<ExecutionProfile>(`/execution-profiles/${id}`);
}

export function createExecutionProfile(data: {
  name: string;
  description?: string | null;
  model: string;
  temperature: number;
  api_provider: ApiProvider;
  max_tokens?: number | null;
}): Promise<ExecutionProfile> {
  return api.post<ExecutionProfile>("/execution-profiles", data);
}

export function updateExecutionProfile(
  id: number,
  data: {
    name?: string;
    description?: string | null;
    model?: string;
    temperature?: number;
    api_provider?: ApiProvider;
    max_tokens?: number | null;
  },
): Promise<ExecutionProfile> {
  return api.patch<ExecutionProfile>(`/execution-profiles/${id}`, data);
}

export function deleteExecutionProfile(id: number): Promise<void> {
  return api.delete<void>(`/execution-profiles/${id}`);
}

export function listExecutionProfileModels(data: {
  api_provider: ApiProvider;
  api_key: string;
}): Promise<{ models: LLMModelOption[] }> {
  return api.post<{ models: LLMModelOption[] }>("/execution-profiles/models", data);
}

export function getContextAssets(filters?: ContextAssetFilters): Promise<ContextAssetSummary[]> {
  const params = new URLSearchParams();
  if (filters?.q) {
    params.set("q", filters.q);
  }
  if (filters?.project_id !== undefined) {
    params.set("project_id", String(filters.project_id));
  }
  if (filters?.unclassified !== undefined) {
    params.set("unclassified", String(filters.unclassified));
  }
  if (filters?.linked_to) {
    params.set("linked_to", filters.linked_to);
  }
  const query = params.toString();
  return api.get<ContextAssetSummary[]>(query ? `/context-assets?${query}` : "/context-assets");
}

export function getContextAsset(id: number): Promise<ContextAssetDetail> {
  return api.get<ContextAssetDetail>(`/context-assets/${id}`);
}

export function createContextAsset(data: {
  name: string;
  path: string;
  content: string;
  mime_type: string;
}): Promise<ContextAssetDetail> {
  return api.post<ContextAssetDetail>("/context-assets", data);
}

export function updateContextAsset(
  id: number,
  data: {
    name?: string;
    path?: string;
    content?: string;
    mime_type?: string;
  },
): Promise<ContextAssetDetail> {
  return api.patch<ContextAssetDetail>(`/context-assets/${id}`, data);
}

export function deleteContextAsset(id: number): Promise<void> {
  return api.delete<void>(`/context-assets/${id}`);
}

export function setContextAssetProjects(
  id: number,
  data: { project_ids: number[] },
): Promise<ContextAssetDetail> {
  return api.put<ContextAssetDetail>(`/context-assets/${id}/projects`, data);
}

// Annotation Candidate API

export type CandidateStatus = "pending" | "accepted" | "rejected";

export type AnnotationCandidate = {
  id: number;
  annotation_task_id: number;
  run_id: number | null;
  target_text_ref: string;
  label: string;
  start_line: number;
  end_line: number;
  quote: string;
  note: string | null;
  status: CandidateStatus;
  created_at: number;
  updated_at: number;
};

export type GoldAnnotation = {
  id: number;
  annotation_task_id: number;
  target_text_ref: string;
  label: string;
  start_line: number;
  end_line: number;
  quote: string;
  note: string | null;
  source_candidate_id: number | null;
  created_at: number;
  updated_at: number;
};

export function getAnnotationCandidates(filters?: {
  annotation_task_id?: number;
  run_id?: number;
  test_case_id?: number;
  status?: CandidateStatus;
}): Promise<AnnotationCandidate[]> {
  const params = new URLSearchParams();
  if (filters?.annotation_task_id !== undefined) {
    params.set("annotation_task_id", String(filters.annotation_task_id));
  }
  if (filters?.run_id !== undefined) {
    params.set("run_id", String(filters.run_id));
  }
  if (filters?.test_case_id !== undefined) {
    params.set("test_case_id", String(filters.test_case_id));
  }
  if (filters?.status !== undefined) {
    params.set("status", filters.status);
  }
  const query = params.toString();
  return api.get<AnnotationCandidate[]>(
    query ? `/annotation-candidates?${query}` : "/annotation-candidates",
  );
}

export function updateAnnotationCandidate(
  id: number,
  data: {
    label?: string;
    start_line?: number;
    end_line?: number;
    note?: string | null;
    status?: CandidateStatus;
  },
): Promise<{ candidate: AnnotationCandidate; gold?: GoldAnnotation }> {
  return api.patch<{ candidate: AnnotationCandidate; gold?: GoldAnnotation }>(
    `/annotation-candidates/${id}`,
    data,
  );
}

export function getGoldAnnotations(filters?: {
  annotation_task_id?: number;
  test_case_id?: number;
}): Promise<GoldAnnotation[]> {
  const params = new URLSearchParams();
  if (filters?.annotation_task_id !== undefined) {
    params.set("annotation_task_id", String(filters.annotation_task_id));
  }
  if (filters?.test_case_id !== undefined) {
    params.set("test_case_id", String(filters.test_case_id));
  }
  const query = params.toString();
  return api.get<GoldAnnotation[]>(query ? `/gold-annotations?${query}` : "/gold-annotations");
}

export function deleteGoldAnnotation(id: number): Promise<{ success: boolean }> {
  return api.delete<{ success: boolean }>(`/gold-annotations/${id}`);
}

export function createGoldAnnotation(data: {
  annotation_task_id: number;
  target_text_ref: string;
  label: string;
  start_line: number;
  end_line: number;
  quote: string;
  note?: string | null;
}): Promise<GoldAnnotation> {
  return api.post<GoldAnnotation>("/gold-annotations", data);
}

export function extractAnnotationCandidates(
  projectId: number,
  runId: number,
  data: {
    annotation_task_id: number;
    source_type?: "structured_json" | "final_answer" | "trace_step";
    source_step_id?: string;
  },
): Promise<{ candidates_created: number; annotation_task_id: number }> {
  return api.post<{ candidates_created: number; annotation_task_id: number }>(
    `/projects/${projectId}/runs/${runId}/candidates/extract`,
    data,
  );
}

export function extractAnnotationCandidatesIndependent(
  runId: number,
  data: {
    annotation_task_id: number;
    source_type?: "structured_json" | "final_answer" | "trace_step";
    source_step_id?: string;
  },
): Promise<{ candidates_created: number; annotation_task_id: number }> {
  return api.post<{ candidates_created: number; annotation_task_id: number }>(
    `/runs/${runId}/candidates/extract`,
    data,
  );
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

export type ScoreProgressionFilters = {
  project_id?: number;
};

export function getScoreProgressionIndependent(
  filters?: ScoreProgressionFilters,
): Promise<ScoreProgressionResponse> {
  const params = new URLSearchParams();
  if (filters?.project_id !== undefined) {
    params.set("project_id", String(filters.project_id));
  }
  const query = params.toString();
  return api.get<ScoreProgressionResponse>(
    query ? `/score-progression?${query}` : "/score-progression",
  );
}
