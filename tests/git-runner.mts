#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createGitRunner, parseGitStatus } from "../scripts/lib/git-runner.mjs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const target = fs.mkdtempSync(path.join(os.tmpdir(), "harness-git-runner-"));
const runner = createGitRunner();

git(["init"]);
git(["config", "user.name", "Harness Test"]);
git(["config", "user.email", "harness-test@example.invalid"]);
fs.writeFileSync(path.join(target, "tracked.txt"), "initial\n");
git(["add", "tracked.txt"]);
git(["commit", "-m", "initial commit"]);

const root = runner.root(target);
assert(root.status === 0 && fs.realpathSync(root.stdout.trim()) === fs.realpathSync(target), "GitRunner should resolve the repository root");
assert(runner.identity(target).name === "Harness Test", "GitRunner should read local git user.name");
assert(runner.identity(target).email === "harness-test@example.invalid", "GitRunner should read local git user.email");
assert(/^[0-9a-f]{40}$/.test(runner.head(target)), "GitRunner should read HEAD");

fs.writeFileSync(path.join(target, "tracked.txt"), "updated\n");
fs.writeFileSync(path.join(target, "untracked.txt"), "new\n");
const status = runner.statusEntries(target);
assert(status.some((entry) => entry.path === "tracked.txt" && entry.worktree === "M"), "GitRunner should parse modified tracked paths");
assert(status.some((entry) => entry.path === "untracked.txt" && entry.index === "?"), "GitRunner should parse untracked paths");

git(["add", "tracked.txt"]);
git(["commit", "-m", "update tracked"]);
const head = runner.head(target);
assert(runner.commitSubject(target, head) === "update tracked", "GitRunner should read commit subjects");
assert(runner.commitChangedPaths(target, head).includes("tracked.txt"), "GitRunner should read changed paths for a commit");
assert(runner.verifyCommit(target, head).status === 0, "GitRunner should verify an existing commit");
assert(runner.isAncestor(target, head), "GitRunner should check ancestor reachability");

const parsedRename = parseGitStatus("R  old.txt -> new.txt\n");
assert(parsedRename[0]?.path === "new.txt", "Git status parser should use the destination path for renames");

console.log("Git runner tests passed");

function git(args: string[]): void {
  const result = spawnSync("git", args, { cwd: target, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}
