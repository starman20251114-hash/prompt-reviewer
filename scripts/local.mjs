import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.resolve(repoRoot, "data");
const dbPath = path.resolve(dataDir, "prompt-reviewer.sqlite");
const uiDistDir = path.resolve(repoRoot, "packages", "ui", "dist");
const port = process.env.PORT ?? "3000";
const commandRunner =
  process.platform === "win32"
    ? { command: "pwsh", baseArgs: ["-Command", "pnpm"] }
    : { command: "pnpm", baseArgs: [] };

function ensureDataDir() {
  mkdirSync(dataDir, { recursive: true });
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPnpm(args, env = process.env) {
  run(commandRunner.command, [...commandRunner.baseArgs, ...args], env);
}

const localEnv = {
  ...process.env,
  DB_PATH: process.env.DB_PATH ?? dbPath,
  UI_DIST_DIR: process.env.UI_DIST_DIR ?? uiDistDir,
  PORT: port,
};

const action = process.argv[2];

switch (action) {
  case "setup":
    ensureDataDir();
    runPnpm(["install"]);
    runPnpm(["--filter", "@prompt-reviewer/core", "build"], localEnv);
    runPnpm(["--filter", "@prompt-reviewer/ui", "build"], localEnv);
    runPnpm(["--filter", "@prompt-reviewer/core", "migrate"], localEnv);
    break;
  case "build":
    ensureDataDir();
    runPnpm(["--filter", "@prompt-reviewer/core", "build"], localEnv);
    runPnpm(["--filter", "@prompt-reviewer/ui", "build"], localEnv);
    break;
  case "migrate":
    ensureDataDir();
    runPnpm(["--filter", "@prompt-reviewer/core", "migrate"], localEnv);
    break;
  case "seed":
    ensureDataDir();
    runPnpm(["--filter", "@prompt-reviewer/core", "seed"], localEnv);
    break;
  case "start":
    ensureDataDir();
    if (!existsSync(path.join(uiDistDir, "index.html"))) {
      console.error("UI build output was not found. Run `pnpm build:local` first.");
      process.exit(1);
    }
    runPnpm(["--filter", "@prompt-reviewer/server", "start"], localEnv);
    break;
  default:
    console.error("Usage: node scripts/local.mjs <setup|build|migrate|seed|start>");
    process.exit(1);
}
