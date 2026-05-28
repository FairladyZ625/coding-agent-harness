import fs from "node:fs";
import path from "node:path";
import { inspectGit } from "./governance-sync.mjs";

type HarnessTarget = {
  projectRoot: string;
};

type GitStatusEntry = {
  path: string;
  index: string;
  worktree: string;
};

type GitInspection = {
  inGit: boolean;
  gitRoot: string;
  entries: GitStatusEntry[];
};

type GitSummary = {
  summary: {
    inGit: boolean;
    root: string;
    dirty: boolean;
    entries: GitStatusEntry[];
    blocksCliAutoCommit: boolean;
  };
  warnings: string[];
};

export function summarizeGitState(target: HarnessTarget): GitSummary {
  const state = inspectGit(target.projectRoot) as GitInspection;
  if (!state.inGit) {
    return {
      summary: {
        inGit: false,
        root: "",
        dirty: false,
        entries: [],
        blocksCliAutoCommit: false,
      },
      warnings: [],
    };
  }
  const targetRoot = real(target.projectRoot);
  const gitRoot = real(state.gitRoot);
  const rootMatches = gitRoot === targetRoot;
  const entries = rootMatches ? state.entries.map((entry) => ({
    path: entry.path,
    index: entry.index,
    worktree: entry.worktree,
  })) : [];
  const dirty = entries.length > 0;
  const warnings: string[] = [];
  if (dirty) {
    warnings.push(`dirty-state: ${entries.length} uncommitted Git path(s) may block CLI-owned auto-commit when they overlap a command write scope or are staged; commit them or record owner/no-commit reason before lifecycle commands.`);
  }
  return {
    summary: {
      inGit: true,
      root: rootMatches ? "TARGET:." : "outside-target",
      dirty,
      entries,
      blocksCliAutoCommit: !rootMatches || dirty,
    },
    warnings,
  };
}

function real(filePath: string): string {
  return fs.realpathSync(filePath);
}
