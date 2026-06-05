import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Effect, Layer } from "effect";

import {
  createWriteScope,
  isPathAllowedByWriteScope,
  type WriteScope,
} from "../domain/index.mjs";
import {
  WriteScopeViolationError,
  type TaskKernelError,
} from "../errors.mjs";
import {
  GitUnitOfWork,
  GIT_UNIT_OF_WORK_PORT_ID,
  type GitUnitOfWorkInput,
  type GitUnitOfWorkResult,
  type GitUnitOfWorkServiceShape,
} from "../ports/index.mjs";

export type GitUnitOfWorkOptions = Readonly<{
  root?: string;
}>;

type GitStatusEntry = Readonly<{
  index: string;
  worktree: string;
  path: string;
  raw: string;
}>;

type FingerprintedGitStatusEntry = GitStatusEntry & Readonly<{
  fingerprint: string;
}>;

type FileSnapshot =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "file"; content: Buffer; mode: number }>
  | Readonly<{ kind: "symlink"; target: string }>
  | Readonly<{ kind: "directory"; mode: number }>
  | Readonly<{ kind: "other"; mode: number }>;

type TransactionSnapshot = Readonly<{
  root: string;
  entries: ReadonlyMap<string, FingerprintedGitStatusEntry>;
  files: ReadonlyMap<string, FileSnapshot>;
}>;

export function createGitUnitOfWork(options: GitUnitOfWorkOptions = {}): GitUnitOfWorkServiceShape {
  const root = path.resolve(options.root ?? ".");
  return {
    identity: GIT_UNIT_OF_WORK_PORT_ID,
    transact: <A, E, R>(
      input: GitUnitOfWorkInput,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<GitUnitOfWorkResult<A>, E | TaskKernelError, R> =>
      Effect.flatMap(
        Effect.try({
          try: () => beginTransaction(root, input),
          catch: taskKernelErrorFromUnknown,
        }),
        ({ writeScope, snapshot }) =>
          effect.pipe(
            Effect.flatMap((value) =>
              Effect.try({
                try: () => completeTransaction(input, writeScope, snapshot, value),
                catch: taskKernelErrorFromUnknown,
              }),
            ),
            Effect.catchAll((error) =>
              Effect.zipRight(
                Effect.try({
                  try: () => rollbackTransactionChanges(snapshot),
                  catch: taskKernelErrorFromUnknown,
                }),
                Effect.fail(error),
              ),
            ),
          ),
      ),
  };
}

export const GitUnitOfWorkLiveLayer = Layer.succeed(GitUnitOfWork, createGitUnitOfWork());

export function createGitUnitOfWorkLiveLayer(options: GitUnitOfWorkOptions = {}) {
  return Layer.succeed(GitUnitOfWork, createGitUnitOfWork(options));
}

function beginTransaction(root: string, input: GitUnitOfWorkInput): {
  writeScope: WriteScope;
  snapshot: TransactionSnapshot;
} {
  assertGitWorkTree(root);
  const writeScope = createWriteScope({ allowedPaths: input.writeScope.allowedPaths });
  const snapshot = inspectTransactionSnapshot(root);
  const dirtyAllowedPaths = [...snapshot.entries.values()]
    .filter((entry) => isPathAllowedByWriteScope(writeScope, entry.path))
    .map((entry) => entry.path);
  if (dirtyAllowedPaths.length > 0) {
    throw new WriteScopeViolationError(
      `Git Unit of Work cannot start with dirty files inside the write scope for ${input.label}: ${dirtyAllowedPaths.join(", ")}`,
    );
  }
  return { writeScope, snapshot };
}

function completeTransaction<A>(
  input: GitUnitOfWorkInput,
  writeScope: WriteScope,
  snapshot: TransactionSnapshot,
  value: A,
): GitUnitOfWorkResult<A> {
  const changed = changedEntriesSince(snapshot);
  const outOfScope = changed.filter((entry) => !isPathAllowedByWriteScope(writeScope, entry.path));
  if (outOfScope.length > 0) {
    throw new WriteScopeViolationError(
      `Git Unit of Work ${input.label} produced changes outside the write scope: ${outOfScope.map((entry) => entry.path).join(", ")}`,
    );
  }
  return {
    value,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
  };
}

function changedEntriesSince(snapshot: TransactionSnapshot): readonly FingerprintedGitStatusEntry[] {
  const after = inspectTransactionSnapshot(snapshot.root);
  const paths = new Set([...snapshot.entries.keys(), ...after.entries.keys()]);
  const changed: FingerprintedGitStatusEntry[] = [];
  for (const relativePath of paths) {
    const beforeEntry = snapshot.entries.get(relativePath);
    const afterEntry = after.entries.get(relativePath);
    if (!afterEntry) {
      if (beforeEntry) changed.push(beforeEntry);
      continue;
    }
    if (!beforeEntry || beforeEntry.raw !== afterEntry.raw || beforeEntry.fingerprint !== afterEntry.fingerprint) {
      changed.push(afterEntry);
    }
  }
  return changed.sort((left, right) => left.path.localeCompare(right.path));
}

function rollbackTransactionChanges(snapshot: TransactionSnapshot): void {
  const changed = changedEntriesSince(snapshot);
  for (const entry of changed) {
    restorePath(snapshot, entry.path);
  }
}

function restorePath(snapshot: TransactionSnapshot, relativePath: string): void {
  const before = snapshot.files.get(relativePath) ?? gitHeadSnapshot(snapshot.root, relativePath);
  restoreSnapshot(snapshot.root, relativePath, before);
}

function restoreSnapshot(root: string, relativePath: string, snapshot: FileSnapshot): void {
  const absolute = absoluteInsideRoot(root, relativePath);
  if (snapshot.kind === "missing") {
    fs.rmSync(absolute, { recursive: true, force: true });
    pruneEmptyParents(root, path.dirname(absolute));
    return;
  }

  fs.rmSync(absolute, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  if (snapshot.kind === "file") {
    fs.writeFileSync(absolute, snapshot.content);
    fs.chmodSync(absolute, snapshot.mode & 0o777);
    return;
  }
  if (snapshot.kind === "symlink") {
    fs.symlinkSync(snapshot.target, absolute);
    return;
  }
  if (snapshot.kind === "directory") {
    fs.mkdirSync(absolute, { recursive: true, mode: snapshot.mode & 0o777 });
    return;
  }
  fs.closeSync(fs.openSync(absolute, "w"));
  fs.chmodSync(absolute, snapshot.mode & 0o777);
}

function inspectTransactionSnapshot(root: string): TransactionSnapshot {
  const entries = fingerprintEntries(root, gitStatusEntries(root));
  const files = new Map(entries.map((entry) => [entry.path, readFileSnapshot(root, entry.path)] as const));
  return {
    root,
    entries: new Map(entries.map((entry) => [entry.path, entry] as const)),
    files,
  };
}

function fingerprintEntries(root: string, entries: readonly GitStatusEntry[]): readonly FingerprintedGitStatusEntry[] {
  return entries.map((entry) => ({ ...entry, fingerprint: fingerprintPath(root, entry.path) }));
}

function fingerprintPath(root: string, relativePath: string): string {
  const absolute = absoluteInsideRoot(root, relativePath);
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) return `symlink:${fs.readlinkSync(absolute)}`;
    if (stat.isFile()) {
      return `file:${stat.size}:${crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex")}`;
    }
    if (stat.isDirectory()) return "directory";
    return `${stat.mode}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function readFileSnapshot(root: string, relativePath: string): FileSnapshot {
  const absolute = absoluteInsideRoot(root, relativePath);
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) return { kind: "symlink", target: fs.readlinkSync(absolute) };
    if (stat.isFile()) return { kind: "file", content: fs.readFileSync(absolute), mode: stat.mode };
    if (stat.isDirectory()) return { kind: "directory", mode: stat.mode };
    return { kind: "other", mode: stat.mode };
  } catch {
    return { kind: "missing" };
  }
}

function gitHeadSnapshot(root: string, relativePath: string): FileSnapshot {
  const show = runGit(root, ["show", `HEAD:${relativePath}`]);
  if (show.status !== 0) return { kind: "missing" };
  return {
    kind: "file",
    content: show.stdout,
    mode: 0o644,
  };
}

function gitStatusEntries(root: string): readonly GitStatusEntry[] {
  const result = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (result.status !== 0) {
    throw new WriteScopeViolationError(`git status failed while inspecting Git Unit of Work scope: ${result.stderr.toString("utf8").trim()}`);
  }
  return result.stdout
    .toString("utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map(parseGitStatusLine)
    .filter((entry) => entry.path !== ".harness/locks/governance-sync.lock");
}

function parseGitStatusLine(raw: string): GitStatusEntry {
  const index = raw[0] ?? " ";
  const worktree = raw[1] ?? " ";
  const rest = raw.slice(3);
  const pathPart = rest.includes(" -> ") ? rest.split(" -> ").at(-1) ?? rest : rest;
  return {
    index,
    worktree,
    path: pathPart.replaceAll("\\", "/"),
    raw,
  };
}

function assertGitWorkTree(root: string): void {
  const result = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (result.status !== 0 || result.stdout.toString("utf8").trim() !== "true") {
    throw new WriteScopeViolationError(`Git Unit of Work root is not a Git worktree: ${root}`);
  }
}

function runGit(root: string, args: readonly string[]): { status: number; stdout: Buffer; stderr: Buffer } {
  const result = spawnSync("git", [...args], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0),
  };
}

function absoluteInsideRoot(root: string, relativePath: string): string {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WriteScopeViolationError(`Git Unit of Work path escapes repository root: ${relativePath}`);
  }
  return absolute;
}

function pruneEmptyParents(root: string, start: string): void {
  let current = path.resolve(start);
  const resolvedRoot = path.resolve(root);
  while (current !== resolvedRoot && current.startsWith(resolvedRoot)) {
    try {
      fs.rmdirSync(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

function taskKernelErrorFromUnknown(error: unknown): TaskKernelError {
  if (isTaskKernelError(error)) return error;
  return new WriteScopeViolationError(error instanceof Error ? error.message : String(error));
}

function isTaskKernelError(error: unknown): error is TaskKernelError {
  return error instanceof Error && "_tag" in error;
}
