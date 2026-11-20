const UNIQUE_CONSTRAINT_CODE = "SQLITE_CONSTRAINT_UNIQUE";

/**
 * SQLite の UNIQUE 制約違反かどうかを判定する。
 * drizzle はドライバのエラーを cause に包んで投げることがあるため、cause もたどる。
 */
export function isUniqueConstraintError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ((current as { code?: unknown }).code === UNIQUE_CONSTRAINT_CODE) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
