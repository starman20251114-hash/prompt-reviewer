export type AnnotationReviewContext = {
  runId: string;
  taskId: string;
};

function storageKey(projectId: string | number): string {
  return `prompt-reviewer:annotation-review:${projectId}`;
}

function isValidContext(value: Partial<AnnotationReviewContext>): value is AnnotationReviewContext {
  return (
    typeof value.runId === "string" &&
    value.runId !== "" &&
    typeof value.taskId === "string" &&
    value.taskId !== ""
  );
}

export function getAnnotationReviewContextFromSearch(
  search: string,
): AnnotationReviewContext | null {
  const searchParams = new URLSearchParams(search);
  const runId = searchParams.get("runId");
  const taskId = searchParams.get("taskId");

  if (!runId || !taskId) {
    return null;
  }

  return { runId, taskId };
}

export function loadLastAnnotationReviewContext(
  projectId: string | number,
): AnnotationReviewContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey(projectId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AnnotationReviewContext>;
    return isValidContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastAnnotationReviewContext(
  projectId: string | number,
  context: AnnotationReviewContext,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey(projectId), JSON.stringify(context));
}

export function buildAnnotationReviewPath(
  projectId: string | number,
  context?: AnnotationReviewContext | null,
): string {
  void projectId;
  const basePath = "/annotation-review";

  if (!context) {
    return basePath;
  }

  const searchParams = new URLSearchParams({
    mode: "review",
    runId: context.runId,
    taskId: context.taskId,
  });

  return `${basePath}?${searchParams.toString()}`;
}
