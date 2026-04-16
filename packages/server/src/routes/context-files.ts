import type { Dirent } from "node:fs";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const createContextFileSchema = z.object({
  file_name: z.string().min(1, "file_nameは1文字以上必要です"),
  content: z.string(),
  mime_type: z.string().optional(),
});

const updateContextFileSchema = z.object({
  content: z.string(),
});

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

type ContextFilesRouterOptions = {
  baseDir?: string;
};

const textMimeTypes: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".py": "text/x-python",
  ".sql": "application/sql",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

function getBaseDir(options: ContextFilesRouterOptions): string {
  const configured =
    options.baseDir ??
    process.env.CONTEXT_FILES_DIR ??
    path.resolve(process.cwd(), "data/context-files");
  return path.resolve(configured);
}

function parseProjectId(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function inferMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return textMimeTypes[ext] ?? "text/plain";
}

function sanitizeRelativePath(input: string): string | null {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return null;

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((part) => part === "." || part === "..")) return null;

  return parts.join("/");
}

function resolveProjectRoot(baseDir: string, projectId: number): string {
  return path.join(baseDir, String(projectId));
}

function resolveProjectFilePath(projectRoot: string, relativePath: string): string | null {
  const safeRelativePath = sanitizeRelativePath(relativePath);
  if (!safeRelativePath) return null;

  const resolvedPath = path.resolve(projectRoot, safeRelativePath);
  const relativeToRoot = path.relative(projectRoot, resolvedPath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return resolvedPath;
}

async function listProjectFiles(
  projectRoot: string,
  currentDir = projectRoot,
): Promise<ContextFileSummary[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        return listProjectFiles(projectRoot, fullPath);
      }
      if (!entry.isFile()) {
        return [];
      }

      const fileStat = await stat(fullPath);
      const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, "/");
      return [
        {
          name: entry.name,
          path: relativePath,
          mime_type: inferMimeType(entry.name),
          size: fileStat.size,
          updated_at: fileStat.mtimeMs,
        } satisfies ContextFileSummary,
      ];
    }),
  );

  return files.flat().sort((a, b) => a.path.localeCompare(b.path, "ja"));
}

export function createContextFilesRouter(options: ContextFilesRouterOptions = {}) {
  const router = new Hono();
  const baseDir = getBaseDir(options);

  router.get("/", async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const projectRoot = resolveProjectRoot(baseDir, projectId);
    const files = await listProjectFiles(projectRoot);
    return c.json(files);
  });

  router.post("/", zValidator("json", createContextFileSchema), async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const body = c.req.valid("json");
    const projectRoot = resolveProjectRoot(baseDir, projectId);
    const targetPath = resolveProjectFilePath(projectRoot, body.file_name);
    if (!targetPath) {
      return c.json({ error: "Invalid file_name" }, 400);
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, body.content, "utf8");

    const fileStat = await stat(targetPath);
    return c.json(
      {
        name: path.basename(targetPath),
        path: path.relative(projectRoot, targetPath).replace(/\\/g, "/"),
        mime_type: body.mime_type ?? inferMimeType(targetPath),
        size: fileStat.size,
        updated_at: fileStat.mtimeMs,
      } satisfies ContextFileSummary,
      201,
    );
  });

  router.get("/content", async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const requestedPath = c.req.query("path");
    if (!requestedPath) {
      return c.json({ error: "Missing path" }, 400);
    }

    const projectRoot = resolveProjectRoot(baseDir, projectId);
    const targetPath = resolveProjectFilePath(projectRoot, requestedPath);
    if (!targetPath) {
      return c.json({ error: "Invalid path" }, 400);
    }

    try {
      await access(targetPath);
    } catch {
      return c.json({ error: "Context file not found" }, 404);
    }

    const [content, fileStat] = await Promise.all([readFile(targetPath, "utf8"), stat(targetPath)]);
    return c.json({
      name: path.basename(targetPath),
      path: path.relative(projectRoot, targetPath).replace(/\\/g, "/"),
      mime_type: inferMimeType(targetPath),
      size: fileStat.size,
      updated_at: fileStat.mtimeMs,
      content,
    } satisfies ContextFileDetail);
  });

  router.put("/content", zValidator("json", updateContextFileSchema), async (c) => {
    const projectId = parseProjectId(c.req.param("projectId"));
    if (projectId === null) {
      return c.json({ error: "Invalid projectId" }, 400);
    }

    const requestedPath = c.req.query("path");
    if (!requestedPath) {
      return c.json({ error: "Missing path" }, 400);
    }

    const projectRoot = resolveProjectRoot(baseDir, projectId);
    const targetPath = resolveProjectFilePath(projectRoot, requestedPath);
    if (!targetPath) {
      return c.json({ error: "Invalid path" }, 400);
    }

    try {
      await access(targetPath);
    } catch {
      return c.json({ error: "Context file not found" }, 404);
    }

    const body = c.req.valid("json");
    await writeFile(targetPath, body.content, "utf8");

    const fileStat = await stat(targetPath);
    return c.json({
      name: path.basename(targetPath),
      path: path.relative(projectRoot, targetPath).replace(/\\/g, "/"),
      mime_type: inferMimeType(targetPath),
      size: fileStat.size,
      updated_at: fileStat.mtimeMs,
      content: body.content,
    } satisfies ContextFileDetail);
  });

  return router;
}
