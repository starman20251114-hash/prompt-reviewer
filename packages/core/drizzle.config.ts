import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./src/schema/projects.ts",
    "./src/schema/test-cases.ts",
    "./src/schema/prompt-versions.ts",
    "./src/schema/runs.ts",
  ],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DB_PATH ?? "./dev.db",
  },
});
