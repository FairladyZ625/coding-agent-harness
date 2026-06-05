import fs from "node:fs";
import path from "node:path";
import {
  createTask,
  createTaskArtifact,
  createTaskPhase,
  createWriteScope,
  determineMaterialsState,
  isPathAllowedByWriteScope,
  parseArtifactId,
  parseCloseoutState,
  parseLifecycleState,
  parseModuleKey,
  parseTaskId,
  parseTaskState,
  parseReviewStatus,
} from "../domain/index.mjs";
import type {
  ArtifactId,
  Task,
  TaskArtifact,
  TaskId,
  TaskPhase,
  TaskRef,
  WriteScope,
} from "../domain/index.mjs";
import {
  taskMaterialNames,
} from "../ports/index.mjs";
import type {
  TaskMaterialName,
  TaskMaterialSnapshot,
  TaskPackageMaterials,
  TaskPackageSnapshot,
  TaskPackageStoreReader,
  TaskPackageStoreLocation,
  TaskPackageStoreQuery,
  WriteTaskMaterialInput,
} from "../ports/index.mjs";

export type MarkdownTaskPackageStoreReaderOptions = Readonly<{
  root?: string;
  taskPlanFileName?: "task_plan.md";
}>;

type ParsedArtifact = Readonly<{
  artifact: TaskArtifact;
  materialPath?: string;
  required: boolean;
}>;

export function createMarkdownTaskPackageStoreReader(options: MarkdownTaskPackageStoreReaderOptions = {}): TaskPackageStoreReader {
  const root = path.resolve(options.root ?? ".");
  const taskPlanFileName = options.taskPlanFileName ?? "task_plan.md";

  return {
    list(query: TaskPackageStoreQuery = {}) {
      const snapshots = listTaskPlanPaths(root, taskPlanFileName).flatMap((taskPlanPath) => {
        const snapshot = safeReadSnapshot(root, taskPlanPath);
        return snapshot ? [snapshot] : [];
      });
      return snapshots.filter((snapshot) => matchesQuery(snapshot, query));
    },
    get(ref: TaskRef) {
      return readSnapshot(root, resolveTaskLocation(root, taskPlanFileName, ref).taskPlanPath);
    },
    resolve(ref: TaskRef) {
      return resolveTaskLocation(root, taskPlanFileName, ref);
    },
    readMaterials(ref: TaskRef) {
      const location = resolveTaskLocation(root, taskPlanFileName, ref);
      return {
        location,
        materials: readMaterialSnapshots(root, location.directory),
      };
    },
    writeMaterial(input: WriteTaskMaterialInput) {
      const location = resolveTaskLocation(root, taskPlanFileName, input.ref);
      return writeMaterialSnapshot(root, location.directory, input);
    },
  };
}

function safeReadSnapshot(root: string, taskPlanPath: string): TaskPackageSnapshot | undefined {
  try {
    return readSnapshot(root, taskPlanPath);
  } catch {
    return undefined;
  }
}

function readSnapshot(root: string, taskPlanPath: string): TaskPackageSnapshot {
  assertInsideRoot(root, taskPlanPath);
  const location = locationFromTaskPlan(root, taskPlanPath);
  const materials = readMaterialSnapshots(root, location.directory);
  const parseWarnings: string[] = [];
  const taskPlanContent = materials["task_plan.md"].content;
  const metadata = parseMarkdownMetadata(taskPlanContent);
  const artifacts = parseArtifacts(taskPlanContent);
  const requiredArtifacts = artifacts.filter((artifact) => artifact.required);
  const availableArtifactIds = requiredArtifacts
    .filter((artifact) => artifact.materialPath && materialExists(root, location.directory, artifact.materialPath))
    .map((artifact) => artifact.artifact.id);
  const task = createTask({
    id: location.id,
    title: parseTitle(taskPlanContent, location.id),
    state: parseTaskState(requiredMetadata(metadata, "state")),
    lifecycleState: parseLifecycleState(requiredMetadata(metadata, "lifecycle-state")),
    reviewStatus: parseReviewStatus(requiredMetadata(metadata, "review-status")),
    closeoutState: parseCloseoutState(requiredMetadata(metadata, "closeout-state")),
    materials: determineMaterialsState({
      requiredArtifactIds: requiredArtifacts.map((artifact) => artifact.artifact.id),
      availableArtifactIds,
    }),
    phases: parsePhases(taskPlanContent),
    artifacts: artifacts.map((artifact) => artifact.artifact),
    relations: [],
    modulePlacement: metadata.has("module")
      ? {
          moduleKey: parseModuleKey(requiredMetadata(metadata, "module")),
          taskPath: location.relativeDirectory,
        }
      : undefined,
    auditMetadata: Object.fromEntries(metadata),
  });

  return {
    location,
    task,
    materials,
    parseWarnings,
  };
}

function listTaskPlanPaths(root: string, taskPlanFileName: string): string[] {
  const paths: string[] = [];
  walk(root, (filePath) => {
    if (isOwnedTaskPlanPath(root, filePath, taskPlanFileName)) paths.push(filePath);
  });
  return paths.sort((left, right) => toPosix(path.relative(root, left)).localeCompare(toPosix(path.relative(root, right))));
}

function walk(current: string, visitFile: (filePath: string) => void): void {
  if (!fs.existsSync(current)) return;
  const stat = fs.lstatSync(current);
  if (stat.isDirectory()) {
    if (shouldSkipDirectory(path.basename(current))) return;
    for (const entry of fs.readdirSync(current).sort()) walk(path.join(current, entry), visitFile);
    return;
  }
  if (stat.isFile()) visitFile(current);
}

function shouldSkipDirectory(name: string): boolean {
  return new Set([".git", "node_modules", "dist", "tmp", ".worktrees"]).has(name);
}

function isOwnedTaskPlanPath(root: string, filePath: string, taskPlanFileName: string): boolean {
  if (path.basename(filePath) !== taskPlanFileName) return false;
  const absolute = assertInsideRoot(root, filePath);
  const directory = path.dirname(absolute);
  const ownerDirectory = path.basename(path.dirname(directory));
  if (ownerDirectory !== "tasks") return false;
  try {
    parseTaskId(path.basename(directory));
    return true;
  } catch {
    return false;
  }
}

function resolveTaskLocation(root: string, taskPlanFileName: string, ref: TaskRef): TaskPackageStoreLocation {
  if (ref.kind === "module-path" || ref.kind === "legacy-path") {
    const candidateDirectory = assertInsideRoot(root, path.resolve(root, String(ref.value)));
    const candidateTaskPlan = fs.existsSync(candidateDirectory) && fs.lstatSync(candidateDirectory).isDirectory()
      ? path.join(candidateDirectory, taskPlanFileName)
      : candidateDirectory;
    if (path.basename(candidateTaskPlan) !== taskPlanFileName || !fs.existsSync(candidateTaskPlan)) {
      throw new Error(`Task not found at path: ${String(ref.value)}`);
    }
    return locationFromTaskPlan(root, candidateTaskPlan);
  }

  const id = parseTaskId(String(ref.value));
  const match = listTaskPlanPaths(root, taskPlanFileName)
    .flatMap((taskPlanPath) => {
      try {
        return [locationFromTaskPlan(root, taskPlanPath)];
      } catch {
        return [];
      }
    })
    .find((location) => location.id === id);
  if (!match) throw new Error(`Task not found: ${id}`);
  return match;
}

function locationFromTaskPlan(root: string, taskPlanPath: string): TaskPackageStoreLocation {
  const absoluteTaskPlanPath = assertInsideRoot(root, taskPlanPath);
  const directory = path.dirname(absoluteTaskPlanPath);
  const id = parseTaskId(path.basename(directory));
  return {
    id,
    directory,
    taskPlanPath: absoluteTaskPlanPath,
    relativeDirectory: toPosix(path.relative(root, directory)),
    relativeTaskPlanPath: toPosix(path.relative(root, absoluteTaskPlanPath)),
  };
}

function readMaterialSnapshots(root: string, taskDirectory: string): Readonly<Record<TaskMaterialName, TaskMaterialSnapshot>> {
  const entries = taskMaterialNames.map((name) => {
    const materialPath = path.join(taskDirectory, name);
    assertInsideRoot(root, materialPath);
    return [name, readMaterialSnapshot(root, name, materialPath)] as const;
  });
  return Object.fromEntries(entries) as Readonly<Record<TaskMaterialName, TaskMaterialSnapshot>>;
}

function readMaterialSnapshot(root: string, name: TaskMaterialName, materialPath: string): TaskMaterialSnapshot {
  const source = fs.existsSync(materialPath) ? "standalone" : "missing";
  return {
    name,
    path: materialPath,
    relativePath: toPosix(path.relative(root, materialPath)),
    content: source === "standalone" ? fs.readFileSync(materialPath, "utf8") : "",
    source,
  };
}

function writeMaterialSnapshot(root: string, taskDirectory: string, input: WriteTaskMaterialInput): TaskMaterialSnapshot {
  const materialPath = assertInsideRoot(root, path.join(taskDirectory, input.materialName));
  const relativePath = toPosix(path.relative(root, materialPath));
  assertWriteAllowed(input.writeScope, relativePath);
  fs.mkdirSync(path.dirname(materialPath), { recursive: true });
  fs.writeFileSync(materialPath, input.content, "utf8");
  return readMaterialSnapshot(root, input.materialName, materialPath);
}

function assertWriteAllowed(writeScope: WriteScope, relativePath: string): void {
  const normalizedScope = createWriteScope({ allowedPaths: writeScope.allowedPaths });
  if (!isPathAllowedByWriteScope(normalizedScope, relativePath)) {
    throw new Error(`Write outside Task Kernel repository write scope: ${relativePath}`);
  }
}

function parseMarkdownMetadata(content: string): Map<string, string> {
  const metadata = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9 /_-]*):\s*(.+)$/);
    if (!match) continue;
    metadata.set(normalizeMetadataKey(match[1]), match[2].trim());
  }
  return metadata;
}

function parseTitle(content: string, fallback: TaskId): string {
  const match = content.match(/^#\s+(.+)$/m);
  return (match?.[1] ?? fallback).trim();
}

function parseArtifacts(content: string): ParsedArtifact[] {
  return markdownRowsInSection(content, "artifacts")
    .filter((cells) => /^ART-\d{3,}$/i.test(cells[0] ?? ""))
    .map((cells) => {
      const id = parseArtifactId(cells[0]);
      return {
        artifact: createTaskArtifact({ id, title: cells[1] || id }),
        materialPath: cells.find((cell) => /\.md$/i.test(cell)),
        required: cells.some((cell) => /\brequired\b/i.test(cell)),
      };
    });
}

function parsePhases(content: string): TaskPhase[] {
  return markdownRowsInSection(content, "phases")
    .filter((cells) => /^[A-Z][A-Z0-9]*-\d{2,}$/i.test(cells[0] ?? "") && !/^ART-/i.test(cells[0] ?? ""))
    .map((cells, order) => createTaskPhase({ id: cells[0], title: cells[1] || cells[0], order }));
}

function markdownRowsInSection(content: string, sectionName: string): string[][] {
  const rows: string[][] = [];
  let inSection = false;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      inSection = normalizeSectionTitle(heading[1]) === sectionName;
      continue;
    }
    if (!inSection) continue;
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) continue;
    rows.push(trimmed.slice(1, -1).split("|").map((cell) => cell.trim()).filter(Boolean));
  }
  return rows;
}

function materialExists(root: string, taskDirectory: string, materialPath: string): boolean {
  const absolute = assertInsideRoot(root, path.resolve(taskDirectory, materialPath));
  return fs.existsSync(absolute) && fs.lstatSync(absolute).isFile();
}

function requiredMetadata(metadata: Map<string, string>, key: string): string {
  const value = metadata.get(key);
  if (!value) throw new Error(`Missing task metadata: ${key}`);
  return value;
}

function matchesQuery(snapshot: TaskPackageSnapshot, query: TaskPackageStoreQuery): boolean {
  if (query.includeArchived === false && (snapshot.task.state === "archived" || snapshot.task.state === "deleted")) return false;
  if (query.state && snapshot.task.state !== query.state) return false;
  if (query.module && snapshot.task.modulePlacement?.moduleKey !== query.module) return false;
  if (query.search) {
    const needle = query.search.toLowerCase();
    return snapshot.task.id.includes(needle) || snapshot.task.title.toLowerCase().includes(needle);
  }
  return true;
}

function assertInsideRoot(root: string, candidate: string): string {
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = path.resolve(candidate);
  const relative = path.relative(absoluteRoot, absoluteCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${candidate}`);
  }
  return absoluteCandidate;
}

function normalizeMetadataKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\s/]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function normalizeSectionTitle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
