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

export function createProject(data: {
  name: string;
  description?: string;
}): Promise<Project> {
  return api.post<Project>("/projects", data);
}

export function deleteProject(id: number): Promise<void> {
  return api.delete<void>(`/projects/${id}`);
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
