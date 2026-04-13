import { serve } from "@hono/node-server";
import { db } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createProjectsRouter } from "./routes/projects.js";
import { createPromptVersionsRouter } from "./routes/prompt-versions.js";
import { createRunsRouter } from "./routes/runs.js";
import { createScoresRouter, createVersionSummaryRouter } from "./routes/scores.js";
import { createTestCasesRouter } from "./routes/test-cases.js";

const app = new Hono();

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

app.route("/api/projects", createProjectsRouter(db));
app.route("/api/projects/:projectId/test-cases", createTestCasesRouter(db));
app.route("/api/projects/:projectId/prompt-versions", createPromptVersionsRouter(db));
app.route("/api/projects/:projectId/prompt-versions", createVersionSummaryRouter(db));
app.route("/api/projects/:projectId/runs", createRunsRouter(db));
app.route("/api/runs", createScoresRouter(db));

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running at http://localhost:${port}`);
});
