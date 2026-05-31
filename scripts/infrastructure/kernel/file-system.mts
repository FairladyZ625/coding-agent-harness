import fs from "node:fs";
import path from "node:path";

export function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

export function readJsonSafe(filePath: string, fallback: null, options?: { onError?: (error: unknown) => void }): unknown | null;
export function readJsonSafe<TValue>(filePath: string, fallback: TValue, options?: { onError?: (error: unknown) => void }): TValue;
export function readJsonSafe(filePath: string, fallback: unknown = null, { onError }: { onError?: (error: unknown) => void } = {}): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (typeof onError === "function") onError(error);
    return fallback;
  }
}

export function walkFiles(root: string, options: { dirFilter?: (entry: string, fullPath: string) => boolean } = {}): string[] {
  const results: string[] = [];
  if (!fs.existsSync(root)) return results;
  const dirFilter = typeof options.dirFilter === "function" ? options.dirFilter : () => true;
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if ([".git", "node_modules", "tmp"].includes(entry)) continue;
        if (!dirFilter(entry, full)) continue;
        walk(full);
      } else {
        results.push(full);
      }
    }
  }
  walk(root);
  return results;
}
