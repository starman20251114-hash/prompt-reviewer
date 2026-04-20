import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "drizzle-kit";

function resolveDrizzleDbUrl(): string {
  const configuredPath = process.env.DB_PATH ?? "../../dev.db";

  if (/^(file:|libsql:|https?:|wss?:)/.test(configuredPath)) {
    return configuredPath;
  }

  const absolutePath = path.resolve(process.cwd(), configuredPath);
  return pathToFileURL(absolutePath).href;
}

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./src/schema/projects.ts",
    "./src/schema/prompt-families.ts",
    "./src/schema/execution-profiles.ts",
    "./src/schema/context-assets.ts",
    "./src/schema/project-links.ts",
    "./src/schema/test-cases.ts",
    "./src/schema/prompt-versions.ts",
    "./src/schema/runs.ts",
    "./src/schema/scores.ts",
    "./src/schema/annotations.ts",
  ],
  out: "./drizzle",
  dbCredentials: {
    url: resolveDrizzleDbUrl(),
  },
});
