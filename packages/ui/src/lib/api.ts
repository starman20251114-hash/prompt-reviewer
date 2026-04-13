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
