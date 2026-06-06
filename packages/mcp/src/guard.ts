/**
 * Defense-in-depth over the read-only DB role: reject anything that is not a
 * single SELECT / WITH...SELECT before it reaches the database.
 */
export function assertReadOnly(sql: string): void {
  const trimmed = sql.trim().replace(/;\s*$/, ""); // tolerate one trailing semicolon
  if (trimmed.includes(";")) {
    throw new Error("Only a single statement is allowed");
  }
  const head = trimmed.replace(/^\(+/, "").trimStart().toLowerCase();
  const isSelect = head.startsWith("select");
  const isCteSelect = head.startsWith("with");
  if (!isSelect && !isCteSelect) {
    throw new Error("Only read-only SELECT / WITH...SELECT queries are allowed");
  }
}
