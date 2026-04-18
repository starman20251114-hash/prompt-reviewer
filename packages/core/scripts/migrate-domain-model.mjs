import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const DEFAULT_DB_PATH = "../../dev.db";
const DEFAULT_CONTEXT_FILES_DIR = "../../data/context-files";

const textMimeTypes = {
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

function resolveTargetPath(targetPath, fallbackPath) {
  return path.resolve(process.cwd(), targetPath ?? fallbackPath);
}

function toTimestamp(value) {
  return Math.round(value);
}

function inferMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return textMimeTypes[ext] ?? "text/plain";
}

function buildContentHash(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function buildProjectFamilyMarker(projectId) {
  return `[migration] prompt_family project_id=${projectId}`;
}

function buildProjectSettingsProfileMarker(projectId) {
  return `[migration] execution_profile project_settings project_id=${projectId}`;
}

function buildRunSnapshotProfileMarker(projectId, model, temperature, apiProvider) {
  return (
    `[migration] execution_profile run_snapshot project_id=${projectId}` +
    ` model=${model} temperature=${temperature} api_provider=${apiProvider}`
  );
}

function buildPromptFamilyName(projectName, projectId) {
  return projectName ? `${projectName} migrated family` : `Project ${projectId} migrated family`;
}

function buildExecutionProfileName(projectName, projectId, model) {
  if (projectName) {
    return `${projectName} migrated profile (${model})`;
  }

  return `Project ${projectId} migrated profile (${model})`;
}

function loadProjects(sqlite) {
  const rows = sqlite.prepare("SELECT id, name FROM projects").all();
  return new Map(rows.map((row) => [row.id, row]));
}

async function collectContextFiles(contextFilesDir) {
  try {
    await access(contextFilesDir);
  } catch {
    return [];
  }

  const projectEntries = await readdir(contextFilesDir, { withFileTypes: true });
  const files = [];

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectId = Number(entry.name);
    if (!Number.isInteger(projectId)) {
      continue;
    }

    const projectRoot = path.join(contextFilesDir, entry.name);
    const nestedFiles = await collectProjectFiles(projectRoot, projectId, projectRoot);
    files.push(...nestedFiles);
  }

  return files.sort((a, b) => {
    if (a.projectId !== b.projectId) {
      return a.projectId - b.projectId;
    }

    return a.relativePath.localeCompare(b.relativePath, "ja");
  });
}

async function collectProjectFiles(projectRoot, projectId, currentDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await collectProjectFiles(projectRoot, projectId, fullPath);
      files.push(...nestedFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const [content, fileStat] = await Promise.all([readFile(fullPath, "utf8"), stat(fullPath)]);
    const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, "/");
    const timestamp = toTimestamp(fileStat.mtimeMs);

    files.push({
      projectId,
      name: path.basename(fullPath),
      relativePath,
      mimeType: inferMimeType(fullPath),
      content,
      contentHash: buildContentHash(content),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return files;
}

function ensurePromptFamilies(sqlite, projects, stats) {
  const promptVersionsByProject = sqlite
    .prepare(
      `
        SELECT project_id, MIN(created_at) AS created_at
        FROM prompt_versions
        GROUP BY project_id
      `,
    )
    .all();

  const findFamilyByMarker = sqlite.prepare(
    "SELECT id FROM prompt_families WHERE description = ? LIMIT 1",
  );
  const updateFamily = sqlite.prepare(
    "UPDATE prompt_families SET name = ?, updated_at = ? WHERE id = ?",
  );
  const insertFamily = sqlite.prepare(
    `
      INSERT INTO prompt_families (name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `,
  );
  const assignFamily = sqlite.prepare(
    `
      UPDATE prompt_versions
      SET prompt_family_id = ?
      WHERE project_id = ? AND prompt_family_id IS NULL
    `,
  );

  for (const row of promptVersionsByProject) {
    const projectId = row.project_id;
    const project = projects.get(projectId);
    const marker = buildProjectFamilyMarker(projectId);
    const familyName = buildPromptFamilyName(project?.name ?? null, projectId);
    const existing = findFamilyByMarker.get(marker);

    let familyId;
    if (existing) {
      familyId = existing.id;
      updateFamily.run(familyName, row.created_at, familyId);
    } else {
      familyId = Number(
        insertFamily.run(familyName, marker, row.created_at, row.created_at).lastInsertRowid,
      );
      stats.createdPromptFamilies += 1;
    }

    stats.linkedPromptVersionsToFamilies += assignFamily.run(familyId, projectId).changes;
  }
}

function ensureProjectLabelLinks(sqlite, stats) {
  stats.createdPromptVersionLabels += sqlite
    .prepare(
      `
        INSERT OR IGNORE INTO prompt_version_projects (prompt_version_id, project_id, created_at)
        SELECT id, project_id, created_at
        FROM prompt_versions
      `,
    )
    .run().changes;

  stats.createdTestCaseLabels += sqlite
    .prepare(
      `
        INSERT OR IGNORE INTO test_case_projects (test_case_id, project_id, created_at)
        SELECT id, project_id, created_at
        FROM test_cases
      `,
    )
    .run().changes;
}

function ensureExecutionProfiles(sqlite, projects, stats) {
  const projectSettingsRows = sqlite
    .prepare(
      `
        SELECT id, project_id, model, temperature, api_provider, created_at, updated_at
        FROM project_settings
        ORDER BY project_id ASC, id ASC
      `,
    )
    .all();

  const findProfileByMarker = sqlite.prepare(
    "SELECT id FROM execution_profiles WHERE description = ? LIMIT 1",
  );
  const updateProfile = sqlite.prepare(
    `
      UPDATE execution_profiles
      SET name = ?, model = ?, temperature = ?, api_provider = ?, updated_at = ?
      WHERE id = ?
    `,
  );
  const insertProfile = sqlite.prepare(
    `
      INSERT INTO execution_profiles (
        name, description, model, temperature, api_provider, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  );

  const profileByProjectId = new Map();
  const settingsByProjectId = new Map();

  for (const row of projectSettingsRows) {
    const project = projects.get(row.project_id);
    const marker = buildProjectSettingsProfileMarker(row.project_id);
    const profileName = buildExecutionProfileName(project?.name ?? null, row.project_id, row.model);
    const existing = findProfileByMarker.get(marker);

    let profileId;
    if (existing) {
      profileId = existing.id;
      updateProfile.run(
        profileName,
        row.model,
        row.temperature,
        row.api_provider,
        row.updated_at,
        profileId,
      );
    } else {
      profileId = Number(
        insertProfile.run(
          profileName,
          marker,
          row.model,
          row.temperature,
          row.api_provider,
          row.created_at,
          row.updated_at,
        ).lastInsertRowid,
      );
      stats.createdExecutionProfiles += 1;
    }

    profileByProjectId.set(row.project_id, profileId);
    settingsByProjectId.set(row.project_id, row);
  }

  const distinctRunSnapshots = sqlite
    .prepare(
      `
        SELECT project_id, model, temperature, api_provider, MIN(created_at) AS created_at
        FROM runs
        WHERE execution_profile_id IS NULL
        GROUP BY project_id, model, temperature, api_provider
      `,
    )
    .all();

  const updateRuns = sqlite.prepare(
    `
      UPDATE runs
      SET execution_profile_id = ?
      WHERE execution_profile_id IS NULL
        AND project_id = ?
        AND model = ?
        AND temperature = ?
        AND api_provider = ?
    `,
  );

  for (const row of distinctRunSnapshots) {
    const settings = settingsByProjectId.get(row.project_id);
    const matchesProjectSettings =
      settings !== undefined &&
      settings.model === row.model &&
      settings.temperature === row.temperature &&
      settings.api_provider === row.api_provider;

    let profileId = matchesProjectSettings ? profileByProjectId.get(row.project_id) : undefined;

    if (profileId === undefined) {
      const project = projects.get(row.project_id);
      const marker = buildRunSnapshotProfileMarker(
        row.project_id,
        row.model,
        row.temperature,
        row.api_provider,
      );
      const profileName = buildExecutionProfileName(
        project?.name ?? null,
        row.project_id,
        row.model,
      );
      const existing = findProfileByMarker.get(marker);

      if (existing) {
        profileId = existing.id;
        updateProfile.run(
          profileName,
          row.model,
          row.temperature,
          row.api_provider,
          row.created_at,
          profileId,
        );
      } else {
        profileId = Number(
          insertProfile.run(
            profileName,
            marker,
            row.model,
            row.temperature,
            row.api_provider,
            row.created_at,
            row.created_at,
          ).lastInsertRowid,
        );
        stats.createdExecutionProfiles += 1;
      }
    }

    stats.assignedRunExecutionProfiles += updateRuns.run(
      profileId,
      row.project_id,
      row.model,
      row.temperature,
      row.api_provider,
    ).changes;
  }
}

function upsertContextAssets(sqlite, files, stats) {
  const findAssetByProjectAndPath = sqlite.prepare(
    `
      SELECT ca.id, ca.content_hash
      FROM context_assets AS ca
      INNER JOIN context_asset_projects AS cap
        ON cap.context_asset_id = ca.id
      WHERE cap.project_id = ? AND ca.path = ?
      ORDER BY ca.id ASC
      LIMIT 1
    `,
  );
  const insertAsset = sqlite.prepare(
    `
      INSERT INTO context_assets (
        name, path, content, mime_type, content_hash, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const updateAsset = sqlite.prepare(
    `
      UPDATE context_assets
      SET name = ?, content = ?, mime_type = ?, content_hash = ?, updated_at = ?
      WHERE id = ?
    `,
  );
  const linkAsset = sqlite.prepare(
    `
      INSERT OR IGNORE INTO context_asset_projects (context_asset_id, project_id, created_at)
      VALUES (?, ?, ?)
    `,
  );

  for (const file of files) {
    const existing = findAssetByProjectAndPath.get(file.projectId, file.relativePath);

    if (existing) {
      if (existing.content_hash !== file.contentHash) {
        stats.updatedContextAssets += updateAsset.run(
          file.name,
          file.content,
          file.mimeType,
          file.contentHash,
          file.updatedAt,
          existing.id,
        ).changes;
      }

      linkAsset.run(existing.id, file.projectId, file.createdAt);
      continue;
    }

    const assetId = Number(
      insertAsset.run(
        file.name,
        file.relativePath,
        file.content,
        file.mimeType,
        file.contentHash,
        file.createdAt,
        file.updatedAt,
      ).lastInsertRowid,
    );

    linkAsset.run(assetId, file.projectId, file.createdAt);
    stats.createdContextAssets += 1;
    stats.createdContextAssetLabels += 1;
  }
}

export async function migrateDomainModelData(options = {}) {
  const dbPath = resolveTargetPath(options.dbPath, DEFAULT_DB_PATH);
  const contextFilesDir = resolveTargetPath(options.contextFilesDir, DEFAULT_CONTEXT_FILES_DIR);
  const logger = options.logger ?? console;
  const contextFiles = await collectContextFiles(contextFilesDir);
  const sqlite = new Database(dbPath);

  const stats = {
    createdPromptFamilies: 0,
    linkedPromptVersionsToFamilies: 0,
    createdPromptVersionLabels: 0,
    createdTestCaseLabels: 0,
    createdExecutionProfiles: 0,
    assignedRunExecutionProfiles: 0,
    createdContextAssets: 0,
    updatedContextAssets: 0,
    createdContextAssetLabels: 0,
  };

  try {
    sqlite.pragma("foreign_keys = ON");

    const transaction = sqlite.transaction(() => {
      const projects = loadProjects(sqlite);
      ensurePromptFamilies(sqlite, projects, stats);
      ensureProjectLabelLinks(sqlite, stats);
      ensureExecutionProfiles(sqlite, projects, stats);
      upsertContextAssets(sqlite, contextFiles, stats);
    });

    transaction();
  } finally {
    sqlite.close();
  }

  logger.log(`Migrated domain-model data for ${dbPath}`);
  logger.log(`Context files source: ${contextFilesDir}`);
  logger.log(
    [
      `prompt_families created=${stats.createdPromptFamilies}`,
      `prompt_versions linked=${stats.linkedPromptVersionsToFamilies}`,
      `prompt_version_projects inserted=${stats.createdPromptVersionLabels}`,
      `test_case_projects inserted=${stats.createdTestCaseLabels}`,
      `execution_profiles created=${stats.createdExecutionProfiles}`,
      `runs assigned=${stats.assignedRunExecutionProfiles}`,
      `context_assets created=${stats.createdContextAssets}`,
      `context_assets updated=${stats.updatedContextAssets}`,
      `context_asset_projects inserted=${stats.createdContextAssetLabels}`,
    ].join(", "),
  );

  return {
    dbPath,
    contextFilesDir,
    stats,
  };
}

async function main() {
  const dbPathArg = process.argv[2];
  const contextFilesDirArg = process.argv[3];
  await migrateDomainModelData({
    dbPath: dbPathArg,
    contextFilesDir: contextFilesDirArg,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Failed to migrate domain-model data:");
    console.error(error);
    process.exit(1);
  });
}
