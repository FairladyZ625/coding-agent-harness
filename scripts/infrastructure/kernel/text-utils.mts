export function slug(value: unknown): string {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export function sanitizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/file:\/\/\/[^\s)"'`<>\]]+/g, "LOCAL_FILE_URL_REDACTED")
    .replaceAll("file://", "LOCAL_FILE_URL_REDACTED")
    .replace(/\/Users\/[^/\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/Volumes\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/(?:private\/)?tmp\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/var\/folders\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/home\/[^/\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/[A-Za-z]:\\[^\s)"'`<>\]]+(?:\\[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED");
}

export function sanitizeDeep(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeDeep(entry)]));
  }
  return value;
}

export function titleFromMarkdown(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}
