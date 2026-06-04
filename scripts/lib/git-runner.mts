import { spawnSync } from "node:child_process";
import path from "node:path";
import { toPosix } from "./core-shared.mjs";

export type GitCommandResult = ReturnType<typeof spawnSync> & {
  stdout: string;
  stderr: string;
  status: number | null;
};

export type GitStatusEntry = {
  index: string;
  worktree: string;
  path: string;
  raw: string;
};

type GitRunnerCache = {
  roots: Map<string, string>;
  identities: Map<string, { name: string; email: string }>;
};

export type GitRunner = {
  run(cwd: string, args: string[]): GitCommandResult;
  root(cwd: string): GitCommandResult;
  currentBranch(cwd: string): string;
  identity(cwd: string): { name: string; email: string };
  statusEntries(cwd: string, options?: { includeIgnored?: boolean }): GitStatusEntry[];
  head(cwd: string): string;
  commitChangedPaths(cwd: string, commit: string): string[];
  commitSubject(cwd: string, commit: string): string;
  verifyCommit(cwd: string, commit: string): GitCommandResult;
  isAncestor(cwd: string, ancestor: string, descendant?: string): boolean;
};

export function createGitRunner(): GitRunner {
  const cache: GitRunnerCache = {
    roots: new Map(),
    identities: new Map(),
  };
  return {
    run(cwd, args) {
      return spawnSync("git", args, { cwd, encoding: "utf8" }) as GitCommandResult;
    },
    root(cwd) {
      const resolved = path.resolve(cwd);
      const cached = cache.roots.get(resolved);
      if (cached) return gitSuccess(cached);
      const result = this.run(resolved, ["rev-parse", "--show-toplevel"]);
      if (result.status === 0) cache.roots.set(resolved, path.resolve(result.stdout.trim()));
      return result;
    },
    currentBranch(cwd) {
      const result = this.run(cwd, ["branch", "--show-current"]);
      return result.status === 0 ? result.stdout.trim() : "";
    },
    identity(cwd) {
      const rootResult = this.root(cwd);
      const key = rootResult.status === 0 ? path.resolve(rootResult.stdout.trim()) : path.resolve(cwd);
      const cached = cache.identities.get(key);
      if (cached) return cached;
      const identity = {
        name: this.run(cwd, ["config", "--get", "user.name"]).stdout.trim(),
        email: this.run(cwd, ["config", "--get", "user.email"]).stdout.trim(),
      };
      cache.identities.set(key, identity);
      return identity;
    },
    statusEntries(cwd, options = {}) {
      const args = ["status", "--porcelain=v1", "--untracked-files=all"];
      if (options.includeIgnored === true) args.push("--ignored");
      const output = this.run(cwd, args).stdout;
      return parseGitStatus(output);
    },
    head(cwd) {
      const result = this.run(cwd, ["rev-parse", "HEAD"]);
      return result.status === 0 ? result.stdout.trim() : "";
    },
    commitChangedPaths(cwd, commit) {
      return this.run(cwd, ["diff-tree", "--no-commit-id", "--name-only", "-r", commit]).stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map(toPosix)
        .sort();
    },
    commitSubject(cwd, commit) {
      return this.run(cwd, ["show", "-s", "--format=%s", commit]).stdout.trim();
    },
    verifyCommit(cwd, commit) {
      return this.run(cwd, ["rev-parse", "--verify", `${commit}^{commit}`]);
    },
    isAncestor(cwd, ancestor, descendant = "HEAD") {
      return this.run(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]).status === 0;
    },
  };
}

export const defaultGitRunner = createGitRunner();

export function parseGitStatus(output: string): GitStatusEntry[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      index: line.slice(0, 1),
      worktree: line.slice(1, 2),
      path: toPosix(parseStatusPath(line.slice(3))),
      raw: line,
    }));
}

function parseStatusPath(value: string): string {
  const unquoted = value.replace(/^"|"$/g, "");
  return unquoted.includes(" -> ") ? unquoted.split(" -> ").pop() ?? unquoted : unquoted;
}

function gitSuccess(stdout: string): GitCommandResult {
  return {
    stdout: `${stdout}\n`,
    stderr: "",
    status: 0,
  } as GitCommandResult;
}
