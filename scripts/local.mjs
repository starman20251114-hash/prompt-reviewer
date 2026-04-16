import { spawn, spawnSync } from "node:child_process";
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
const appUrl = process.env.LOCAL_APP_URL ?? `http://localhost:${port}`;
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

function shouldOpenBrowser() {
  return process.env.OPEN_BROWSER_ON_START !== "false";
}

function openBrowser(url) {
  const spawnOptions = {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
  };

  if (process.platform === "win32") {
    spawn(
      "pwsh",
      ["-NoProfile", "-Command", `Start-Sleep -Seconds 2; Start-Process '${url}'`],
      spawnOptions,
    ).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("sh", ["-c", `sleep 2; open '${url}'`], spawnOptions).unref();
    return;
  }

  spawn("sh", ["-c", `sleep 2; xdg-open '${url}'`], spawnOptions).unref();
}

const localEnv = {
  ...process.env,
  DB_PATH: process.env.DB_PATH ?? dbPath,
  UI_DIST_DIR: process.env.UI_DIST_DIR ?? uiDistDir,
  PORT: port,
  LOCAL_APP_URL: appUrl,
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
    if (shouldOpenBrowser()) {
      openBrowser(appUrl);
    }
    runPnpm(["--filter", "@prompt-reviewer/server", "start"], localEnv);
    break;
  default:
    console.error("Usage: node scripts/local.mjs <setup|build|migrate|seed|start>");
    process.exit(1);
}
