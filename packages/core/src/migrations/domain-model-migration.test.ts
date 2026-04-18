import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const cleanupTargets: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupTargets.splice(0).map((target) => rm(target, { recursive: true, force: true })),
  );
});

function createSchema(db: Database.Database) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE projects (
      id integer PRIMARY KEY,
      name text NOT NULL,
      description text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE project_settings (
      id integer PRIMARY KEY,
      project_id integer NOT NULL REFERENCES projects(id),
      model text NOT NULL,
      temperature real NOT NULL,
      api_provider text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE prompt_families (
      id integer PRIMARY KEY AUTOINCREMENT,
      name text,
      description text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE execution_profiles (
      id integer PRIMARY KEY AUTOINCREMENT,
      name text NOT NULL,
      description text,
      model text NOT NULL,
      temperature real NOT NULL,
      api_provider text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE context_assets (
      id integer PRIMARY KEY AUTOINCREMENT,
      name text NOT NULL,
      path text NOT NULL,
      content text NOT NULL,
      mime_type text NOT NULL,
      content_hash text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE test_cases (
      id integer PRIMARY KEY,
      project_id integer NOT NULL REFERENCES projects(id),
      title text NOT NULL,
      turns text NOT NULL,
      context_content text NOT NULL,
      expected_description text,
      display_order integer NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE prompt_versions (
      id integer PRIMARY KEY,
      prompt_family_id integer REFERENCES prompt_families(id),
      project_id integer NOT NULL REFERENCES projects(id),
      version integer NOT NULL,
      name text,
      memo text,
      content text NOT NULL,
      workflow_definition text,
      parent_version_id integer REFERENCES prompt_versions(id),
      created_at integer NOT NULL,
      is_selected integer NOT NULL DEFAULT 0
    );

    CREATE TABLE runs (
      id integer PRIMARY KEY,
      execution_profile_id integer REFERENCES execution_profiles(id),
      project_id integer NOT NULL REFERENCES projects(id),
      prompt_version_id integer NOT NULL REFERENCES prompt_versions(id),
      test_case_id integer NOT NULL REFERENCES test_cases(id),
      conversation text NOT NULL,
      execution_trace text,
      is_best integer NOT NULL DEFAULT 0,
      is_discarded integer NOT NULL DEFAULT 0,
      created_at integer NOT NULL,
      model text NOT NULL,
      temperature real NOT NULL,
      api_provider text NOT NULL
    );

    CREATE TABLE prompt_version_projects (
      prompt_version_id integer NOT NULL REFERENCES prompt_versions(id),
      project_id integer NOT NULL REFERENCES projects(id),
      created_at integer NOT NULL,
      PRIMARY KEY (prompt_version_id, project_id)
    );

    CREATE TABLE test_case_projects (
      test_case_id integer NOT NULL REFERENCES test_cases(id),
      project_id integer NOT NULL REFERENCES projects(id),
      created_at integer NOT NULL,
      PRIMARY KEY (test_case_id, project_id)
    );

    CREATE TABLE context_asset_projects (
      context_asset_id integer NOT NULL REFERENCES context_assets(id),
      project_id integer NOT NULL REFERENCES projects(id),
      created_at integer NOT NULL,
      PRIMARY KEY (context_asset_id, project_id)
    );
  `);
}

async function createTempFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "prompt-reviewer-domain-model-"));
  cleanupTargets.push(root);

  const dbPath = path.join(root, "migration.sqlite");
  const contextFilesDir = path.join(root, "context-files");
  await mkdir(contextFilesDir, { recursive: true });

  return { root, dbPath, contextFilesDir };
}

async function loadMigrationScript() {
  return (await import("../../scripts/migrate-domain-model.mjs")) as unknown as {
    migrateDomainModelData: (options?: {
      dbPath?: string;
      contextFilesDir?: string;
      logger?: Pick<Console, "log">;
    }) => Promise<{
      dbPath: string;
      contextFilesDir: string;
      stats: {
        createdPromptFamilies: number;
        linkedPromptVersionsToFamilies: number;
        createdPromptVersionLabels: number;
        createdTestCaseLabels: number;
        createdExecutionProfiles: number;
        assignedRunExecutionProfiles: number;
        createdContextAssets: number;
        updatedContextAssets: number;
        createdContextAssetLabels: number;
      };
    }>;
  };
}

describe("migrateDomainModelData", () => {
  it("旧データを新スキーマへ移し替える", async () => {
    const { migrateDomainModelData } = await loadMigrationScript();
    const { dbPath, contextFilesDir } = await createTempFixture();
    const db = new Database(dbPath);
    createSchema(db);

    db.prepare(
      `
        INSERT INTO projects (id, name, description, created_at, updated_at)
        VALUES
          (1, 'Support', NULL, 1000, 1000),
          (2, 'Sales', NULL, 2000, 2000)
      `,
    ).run();

    db.prepare(
      `
        INSERT INTO project_settings (
          id, project_id, model, temperature, api_provider, created_at, updated_at
        )
        VALUES
          (1, 1, 'claude-opus-4-5', 0.7, 'anthropic', 1100, 1200)
      `,
    ).run();

    db.prepare(
      `
        INSERT INTO test_cases (
          id, project_id, title, turns, context_content, expected_description, display_order, created_at, updated_at
        )
        VALUES
          (10, 1, 'delivery', '[]', '', NULL, 1, 1300, 1400),
          (20, 2, 'refund', '[]', '', NULL, 1, 2300, 2400)
      `,
    ).run();

    db.prepare(
      `
        INSERT INTO prompt_versions (
          id, prompt_family_id, project_id, version, name, memo, content, workflow_definition, parent_version_id, created_at, is_selected
        )
        VALUES
          (100, NULL, 1, 1, 'v1', NULL, 'system 1', NULL, NULL, 1500, 1),
          (101, NULL, 1, 2, 'v2', NULL, 'system 2', NULL, 100, 1600, 0),
          (200, NULL, 2, 1, 'sales v1', NULL, 'sales', NULL, NULL, 2500, 1)
      `,
    ).run();

    db.prepare(
      `
        INSERT INTO runs (
          id, execution_profile_id, project_id, prompt_version_id, test_case_id, conversation, execution_trace,
          is_best, is_discarded, created_at, model, temperature, api_provider
        )
        VALUES
          (1000, NULL, 1, 100, 10, '[]', NULL, 1, 0, 1700, 'claude-opus-4-5', 0.7, 'anthropic'),
          (1001, NULL, 1, 101, 10, '[]', NULL, 0, 0, 1800, 'gpt-5.2', 0.1, 'openai'),
          (2000, NULL, 2, 200, 20, '[]', NULL, 1, 0, 2600, 'claude-sonnet-4-5', 0.3, 'anthropic')
      `,
    ).run();
    db.close();

    const project1Dir = path.join(contextFilesDir, "1", "docs");
    const project2Dir = path.join(contextFilesDir, "2");
    await mkdir(project1Dir, { recursive: true });
    await mkdir(project2Dir, { recursive: true });
    await writeFile(path.join(project1Dir, "policy.md"), "# policy", "utf8");
    await writeFile(path.join(project2Dir, "faq.txt"), "faq", "utf8");

    const result = await migrateDomainModelData({
      dbPath,
      contextFilesDir,
      logger: { log() {} },
    });

    expect(result.stats.createdPromptFamilies).toBe(2);
    expect(result.stats.createdExecutionProfiles).toBe(3);
    expect(result.stats.assignedRunExecutionProfiles).toBe(3);
    expect(result.stats.createdContextAssets).toBe(2);

    const migrated = new Database(dbPath, { readonly: true });
    const promptFamilies = migrated
      .prepare("SELECT id, name, description FROM prompt_families ORDER BY id ASC")
      .all() as Array<{ id: number; name: string; description: string }>;
    expect(promptFamilies).toHaveLength(2);
    expect(promptFamilies[0]?.name).toContain("Support");

    const promptVersionLinks = migrated
      .prepare(
        "SELECT prompt_version_id, project_id FROM prompt_version_projects ORDER BY prompt_version_id ASC",
      )
      .all();
    expect(promptVersionLinks).toEqual([
      { prompt_version_id: 100, project_id: 1 },
      { prompt_version_id: 101, project_id: 1 },
      { prompt_version_id: 200, project_id: 2 },
    ]);

    const testCaseLinks = migrated
      .prepare("SELECT test_case_id, project_id FROM test_case_projects ORDER BY test_case_id ASC")
      .all();
    expect(testCaseLinks).toEqual([
      { test_case_id: 10, project_id: 1 },
      { test_case_id: 20, project_id: 2 },
    ]);

    const promptVersions = migrated
      .prepare("SELECT id, prompt_family_id FROM prompt_versions ORDER BY id ASC")
      .all() as Array<{ id: number; prompt_family_id: number }>;
    expect(promptVersions[0]?.prompt_family_id).toBeTruthy();
    expect(promptVersions[0]?.prompt_family_id).toBe(promptVersions[1]?.prompt_family_id);
    expect(promptVersions[2]?.prompt_family_id).not.toBe(promptVersions[0]?.prompt_family_id);

    const executionProfiles = migrated
      .prepare(
        "SELECT id, model, temperature, api_provider, description FROM execution_profiles ORDER BY id ASC",
      )
      .all() as Array<{
      id: number;
      model: string;
      temperature: number;
      api_provider: string;
      description: string;
    }>;
    expect(executionProfiles).toHaveLength(3);
    expect(
      executionProfiles.some((row) => row.description.includes("project_settings project_id=1")),
    ).toBe(true);
    expect(
      executionProfiles.some(
        (row) => row.description.includes("run_snapshot project_id=1") && row.model === "gpt-5.2",
      ),
    ).toBe(true);
    const project1DefaultProfileId = executionProfiles.find((row) =>
      row.description.includes("project_settings project_id=1"),
    )?.id;
    const project1SnapshotProfileId = executionProfiles.find(
      (row) => row.description.includes("run_snapshot project_id=1") && row.model === "gpt-5.2",
    )?.id;

    const runs = migrated
      .prepare("SELECT id, execution_profile_id FROM runs ORDER BY id ASC")
      .all() as Array<{ id: number; execution_profile_id: number }>;
    expect(runs.every((row) => row.execution_profile_id !== null)).toBe(true);
    expect(runs[0]?.execution_profile_id).toBe(project1DefaultProfileId);
    expect(runs[1]?.execution_profile_id).toBe(project1SnapshotProfileId);

    const contextAssets = migrated
      .prepare("SELECT id, name, path, mime_type, content FROM context_assets ORDER BY id ASC")
      .all() as Array<{
      id: number;
      name: string;
      path: string;
      mime_type: string;
      content: string;
    }>;
    expect(contextAssets).toEqual([
      {
        id: contextAssets[0]?.id,
        name: "policy.md",
        path: "docs/policy.md",
        mime_type: "text/markdown",
        content: "# policy",
      },
      {
        id: contextAssets[1]?.id,
        name: "faq.txt",
        path: "faq.txt",
        mime_type: "text/plain",
        content: "faq",
      },
    ]);

    const contextAssetProjects = migrated
      .prepare(
        "SELECT context_asset_id, project_id FROM context_asset_projects ORDER BY project_id ASC, context_asset_id ASC",
      )
      .all();
    expect(contextAssetProjects).toEqual([
      { context_asset_id: contextAssets[0]?.id, project_id: 1 },
      { context_asset_id: contextAssets[1]?.id, project_id: 2 },
    ]);

    migrated.close();
  });

  it("再実行時は project ごとの path をキーに context asset を更新し、重複作成しない", async () => {
    const { migrateDomainModelData } = await loadMigrationScript();
    const { dbPath, contextFilesDir } = await createTempFixture();
    const db = new Database(dbPath);
    createSchema(db);
    db.prepare(
      `
        INSERT INTO projects (id, name, description, created_at, updated_at)
        VALUES (1, 'Support', NULL, 1000, 1000)
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO project_settings (
          id, project_id, model, temperature, api_provider, created_at, updated_at
        )
        VALUES (1, 1, 'claude-opus-4-5', 0.7, 'anthropic', 1100, 1200)
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO test_cases (
          id, project_id, title, turns, context_content, expected_description, display_order, created_at, updated_at
        )
        VALUES (10, 1, 'delivery', '[]', '', NULL, 1, 1300, 1400)
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO prompt_versions (
          id, prompt_family_id, project_id, version, name, memo, content, workflow_definition, parent_version_id, created_at, is_selected
        )
        VALUES (100, NULL, 1, 1, 'v1', NULL, 'system 1', NULL, NULL, 1500, 1)
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO runs (
          id, execution_profile_id, project_id, prompt_version_id, test_case_id, conversation, execution_trace,
          is_best, is_discarded, created_at, model, temperature, api_provider
        )
        VALUES (1000, NULL, 1, 100, 10, '[]', NULL, 1, 0, 1700, 'claude-opus-4-5', 0.7, 'anthropic')
      `,
    ).run();
    db.close();

    const docsDir = path.join(contextFilesDir, "1");
    await mkdir(docsDir, { recursive: true });
    const targetFile = path.join(docsDir, "policy.md");
    await writeFile(targetFile, "before", "utf8");
    await utimes(targetFile, new Date(1000), new Date(1000));

    await migrateDomainModelData({
      dbPath,
      contextFilesDir,
      logger: { log() {} },
    });

    await writeFile(targetFile, "after", "utf8");
    await utimes(targetFile, new Date(2000), new Date(2000));

    const secondRun = await migrateDomainModelData({
      dbPath,
      contextFilesDir,
      logger: { log() {} },
    });

    expect(secondRun.stats.createdContextAssets).toBe(0);
    expect(secondRun.stats.updatedContextAssets).toBe(1);

    const migrated = new Database(dbPath, { readonly: true });
    const assets = migrated
      .prepare("SELECT id, content, updated_at FROM context_assets")
      .all() as Array<{ id: number; content: string; updated_at: number }>;
    expect(assets).toHaveLength(1);
    expect(assets[0]?.content).toBe("after");
    expect(assets[0]?.updated_at).toBe(2000);

    const links = migrated
      .prepare("SELECT context_asset_id, project_id FROM context_asset_projects")
      .all();
    expect(links).toEqual([{ context_asset_id: assets[0]?.id, project_id: 1 }]);
    migrated.close();

    const saved = await readFile(targetFile, "utf8");
    expect(saved).toBe("after");
  });
});
