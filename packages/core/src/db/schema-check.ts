import path from "node:path";
import Database from "better-sqlite3";
import { type SchemaIssues, inspectSchema } from "./schema-inspection";

export function getSchemaIssues(dbPath: string): SchemaIssues {
  const resolvedPath = path.resolve(process.cwd(), dbPath);
  const sqlite = new Database(resolvedPath, { readonly: true });

  try {
    return inspectSchema(sqlite);
  } finally {
    sqlite.close();
  }
}

export function getMissingSchemaColumns(dbPath: string): string[] {
  return getSchemaIssues(dbPath).missing;
}

export function assertRequiredSchema(dbPath: string): void {
  const { missing, obsolete } = getSchemaIssues(dbPath);

  if (missing.length === 0 && obsolete.length === 0) {
    return;
  }

  const migrateCommand =
    dbPath.includes("data/") || dbPath.includes("data\\")
      ? "pnpm migrate:local"
      : "pnpm migrate:dev";

  const details = [
    missing.length > 0 ? `missing ${missing.join(", ")}` : null,
    obsolete.length > 0 ? `obsolete ${obsolete.join(", ")}` : null,
  ]
    .filter((detail) => detail !== null)
    .join("; ");

  throw new Error(
    `DB schema is outdated: ${details}. Run \`${migrateCommand}\` before starting the server.`,
  );
}
