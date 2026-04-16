import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createContextFilesRouter } from "./context-files.js";

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "prompt-reviewer-context-files-"));
}

function buildApp(baseDir: string) {
  const app = new Hono();
  app.route("/api/projects/:projectId/context-files", createContextFilesRouter({ baseDir }));
  return app;
}

const cleanupTargets: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupTargets.splice(0).map((target) => rm(target, { recursive: true, force: true })),
  );
});

describe("context files router", () => {
  it("GET /api/projects/:projectId/context-files returns uploaded files", async () => {
    const baseDir = await createTempDir();
    cleanupTargets.push(baseDir);
    const projectDir = path.join(baseDir, "12");
    await mkdir(path.join(projectDir, "docs"), { recursive: true });
    await writeFile(path.join(projectDir, "docs", "guide.md"), "# guide", {
      encoding: "utf8",
      flag: "w",
    });

    const app = buildApp(baseDir);
    const res = await app.request("/api/projects/12/context-files");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ path: string; name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.path).toBe("docs/guide.md");
    expect(body[0]?.name).toBe("guide.md");
  });

  it("POST /api/projects/:projectId/context-files creates a file under the project directory", async () => {
    const baseDir = await createTempDir();
    cleanupTargets.push(baseDir);
    const app = buildApp(baseDir);

    const res = await app.request("/api/projects/3/context-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: "snapshots/policy.txt",
        content: "refund within 30 days",
      }),
    });

    expect(res.status).toBe(201);
    const saved = await readFile(path.join(baseDir, "3", "snapshots", "policy.txt"), "utf8");
    expect(saved).toBe("refund within 30 days");
  });

  it("GET /content returns file content", async () => {
    const baseDir = await createTempDir();
    cleanupTargets.push(baseDir);
    const targetPath = path.join(baseDir, "7", "context.md");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, "hello context", { encoding: "utf8", flag: "w" });

    const app = buildApp(baseDir);
    const res = await app.request("/api/projects/7/context-files/content?path=context.md");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string; path: string };
    expect(body.content).toBe("hello context");
    expect(body.path).toBe("context.md");
  });

  it("PUT /content updates an existing file", async () => {
    const baseDir = await createTempDir();
    cleanupTargets.push(baseDir);
    const targetPath = path.join(baseDir, "9", "drafts", "memo.md");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, "before", { encoding: "utf8", flag: "w" });

    const app = buildApp(baseDir);
    const res = await app.request("/api/projects/9/context-files/content?path=drafts/memo.md", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "after" }),
    });

    expect(res.status).toBe(200);
    const saved = await readFile(targetPath, "utf8");
    expect(saved).toBe("after");
    const body = (await res.json()) as { content: string };
    expect(body.content).toBe("after");
  });

  it("rejects traversal paths", async () => {
    const baseDir = await createTempDir();
    cleanupTargets.push(baseDir);
    const app = buildApp(baseDir);

    const res = await app.request("/api/projects/4/context-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: "../escape.txt",
        content: "bad",
      }),
    });

    expect(res.status).toBe(400);
  });
});
