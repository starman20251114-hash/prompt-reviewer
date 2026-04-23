import { readFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { assertRequiredSchema, db } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createAnnotationCandidatesRouter,
  createGoldAnnotationsRouter,
} from "./routes/annotation-review.js";
import {
  createAnnotationLabelsRouter,
  createAnnotationTasksRouter,
} from "./routes/annotation-tasks.js";
import { createContextAssetsRouter } from "./routes/context-assets.js";
import { createContextFilesRouter } from "./routes/context-files.js";
import { createExecutionProfilesRouter } from "./routes/execution-profiles.js";
import { createProjectSettingsRouter } from "./routes/project-settings.js";
import { createProjectTestCasesRouter } from "./routes/project-test-cases.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createPromptFamiliesRouter } from "./routes/prompt-families.js";
import { createPromptVersionsRouter } from "./routes/prompt-versions.js";
import { createRunsRouter } from "./routes/runs.js";
import { createScoreProgressionRouter } from "./routes/score-progression.js";
import { createScoresRouter, createVersionSummaryRouter } from "./routes/scores.js";
import { createTestCasesRouter } from "./routes/test-cases.js";

const dbPath = process.env.DB_PATH ?? "../../dev.db";
assertRequiredSchema(dbPath);

const app = new Hono();
const uiDistDir = process.env.UI_DIST_DIR
  ? path.resolve(process.cwd(), process.env.UI_DIST_DIR)
  : null;

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveUiFilePath(requestPath: string): string | null {
  if (!uiDistDir) return null;

  const safePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(uiDistDir, safePath);
  const relativePath = path.relative(uiDistDir, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

async function readUiFile(filePath: string | null): Promise<Uint8Array | null> {
  if (!filePath) return null;

  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api/annotation-tasks", createAnnotationTasksRouter(db));
app.route("/api/annotation-labels", createAnnotationLabelsRouter(db));
app.route("/api/annotation-candidates", createAnnotationCandidatesRouter(db));
app.route("/api/gold-annotations", createGoldAnnotationsRouter(db));
app.route("/api/context-assets", createContextAssetsRouter(db));
app.route("/api/projects", createProjectsRouter(db));
app.route("/api/execution-profiles", createExecutionProfilesRouter(db));
app.route("/api/prompt-families", createPromptFamiliesRouter(db));
app.route("/api/projects/:projectId/context-files", createContextFilesRouter(db));
app.route("/api/test-cases", createTestCasesRouter(db));
app.route("/api/projects/:projectId/test-cases", createProjectTestCasesRouter(db));
app.route("/api/prompt-versions", createPromptVersionsRouter(db));
app.route("/api/projects/:projectId/prompt-versions", createPromptVersionsRouter(db));
app.route("/api/projects/:projectId/prompt-versions", createVersionSummaryRouter(db));
app.route("/api/runs", createRunsRouter(db, { enableCandidateExtractRoute: true }));
app.route("/api/projects/:projectId/runs", createRunsRouter(db));
app.route("/api/runs", createScoresRouter(db));
app.route("/api/score-progression", createScoreProgressionRouter(db));
app.route("/api/projects/:projectId/score-progression", createScoreProgressionRouter(db));
app.route("/api/projects/:projectId/settings", createProjectSettingsRouter(db));
app.get("*", async (c) => {
  if (!uiDistDir) {
    return c.notFound();
  }

  const requestPath = c.req.path;
  if (requestPath.startsWith("/api/")) {
    return c.notFound();
  }

  const assetFilePath = resolveUiFilePath(requestPath);
  const asset = await readUiFile(assetFilePath);
  if (asset && assetFilePath) {
    return new Response(asset, {
      headers: {
        "Content-Type": contentTypes[path.extname(assetFilePath)] ?? "application/octet-stream",
      },
    });
  }

  if (path.extname(requestPath)) {
    return c.notFound();
  }

  const indexFilePath = resolveUiFilePath("/index.html");
  const indexHtml = await readUiFile(indexFilePath);
  if (!indexHtml) {
    return c.notFound();
  }

  return new Response(indexHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
});

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running at http://localhost:${port}`);
});
