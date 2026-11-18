const FIELD_LIMIT = 1500;

type ErrorFields = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

const OBJECT_FIELDS = [
  "message",
  "code",
  "details",
  "hint",
  "status",
  "statusCode",
  "statusText",
] as const;

/** Database failure that keeps the PostgREST fields hidden by a plain object throw. */
export class DatabaseError extends Error {
  readonly code: string;
  readonly details: string;
  readonly hint: string;
  readonly status: number | null;

  constructor(error: ErrorFields, status?: number | null) {
    super(error.message?.trim() || "Database request failed");
    this.name = "DatabaseError";
    this.code = error.code ?? "";
    this.details = error.details ?? "";
    this.hint = error.hint ?? "";
    this.status = typeof status === "number" ? status : null;
  }
}

function fieldText(value: unknown): string | null {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return null;
  const text = value.replace(/\s*\n\s*/g, " | ").trim();
  if (!text) return null;
  return text.length > FIELD_LIMIT ? `${text.slice(0, FIELD_LIMIT)}…` : text;
}

function labeledFields(
  record: Record<string, unknown>,
  keys: readonly string[],
): string[] {
  return keys.flatMap((key) => {
    const text = fieldText(record[key]);
    return text ? [`${key}=${text}`] : [];
  });
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) {
    const code = fieldText((cause as Error & { code?: unknown }).code);
    const message = fieldText(cause.message) ?? "";
    const summary = `${cause.name || "Error"}: ${message}`;
    return code ? `${summary} (${code})` : summary;
  }
  return formatUnknownError(cause);
}

/** Prints message, code, details, hint, and HTTP status for database and fetch failures. */
export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>;
    const message = fieldText(error.message) ?? error.name;
    const summary = error.name && error.name !== "Error"
      ? `${error.name}: ${message}`
      : message;
    const extras = labeledFields(record, ["code", "details", "hint", "status", "statusCode", "statusText"]);
    const cause = record.cause && record.cause !== error
      ? `cause=${formatCause(record.cause)}`
      : null;
    return [summary, ...extras, cause].filter((part): part is string => Boolean(part)).join("; ");
  }

  if (error && typeof error === "object") {
    const parts = labeledFields(error as Record<string, unknown>, OBJECT_FIELDS);
    if (parts.length > 0) return parts.join("; ");
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}
