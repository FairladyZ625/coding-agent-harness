#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assert,
  expectJson,
  repoRoot,
  run,
  todayLocal,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

const target = path.join(tmpRoot, "cli-write-performance-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", target]);
expectJson(["module", "register", "perf", "--title", "Perf", "--prefix", "PERF", "--scope", "src/perf/**", target]);
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);

const sourceTask = path.join(repoRoot, "examples/minimal-project/coding-agent-harness/planning/tasks/demo-task");
const moduleTasksRoot = path.join(target, "coding-agent-harness/planning/modules/perf/tasks");
fs.mkdirSync(moduleTasksRoot, { recursive: true });
for (let index = 1; index <= 24; index += 1) {
  const slug = `perf-history-${String(index).padStart(2, "0")}`;
  const destination = path.join(moduleTasksRoot, slug);
  fs.cpSync(sourceTask, destination, { recursive: true });
  for (const file of ["INDEX.md", "brief.md", "task_plan.md", "progress.md", "review.md", "visual_map.md"]) {
    const filePath = path.join(destination, file);
    if (!fs.existsSync(filePath)) continue;
    fs.writeFileSync(filePath, fs.readFileSync(filePath, "utf8").replaceAll("demo-task", slug).replaceAll("Demo task", `Perf History ${index}`));
  }
  const indexPath = path.join(destination, "INDEX.md");
  fs.writeFileSync(
    indexPath,
    fs.readFileSync(indexPath, "utf8")
      .replace("| Human Review Status | not-confirmed |", "| Human Review Status | confirmed |")
      .replace("| Confirmation ID | n/a |", `| Confirmation ID | HRC-20260605${String(index).padStart(4, "0")} |`)
      .replace("| Confirmed At | n/a |", "| Confirmed At | 2026-06-05 00:18 |")
      .replace("| Reviewer | n/a |", "| Reviewer | Harness Reviewer |")
      .replace("| Reviewer Email | n/a |", "| Reviewer Email | reviewer@example.invalid |")
      .replace("| Confirm Text | n/a |", `| Confirm Text | MODULES/perf/${slug} |`)
      .replace("| Evidence Checked | n/a |", `| Evidence Checked | TARGET:coding-agent-harness/planning/modules/perf/tasks/${slug}/review.md |`)
      .replace("| Review Commit SHA | n/a |", "| Review Commit SHA | deadbee |")
      .replace("| Audit Status | migrated |", "| Audit Status | committed |"),
  );
}
git(target, ["add", "."]);
git(target, ["commit", "-m", "performance fixture baseline"]);

const wrapperDir = path.join(tmpRoot, "cli-write-performance-git-wrapper");
fs.mkdirSync(wrapperDir);
const gitLog = path.join(wrapperDir, "git.log");
fs.writeFileSync(
  path.join(wrapperDir, "git"),
  `#!/usr/bin/env sh\nprintf '%s\\n' "$*" >> "${gitLog.replaceAll("\"", "\\\"")}"\nexec /usr/bin/git "$@"\n`,
  { mode: 0o755 },
);

const result = run(["new-task", "perf-ceiling", "--module", "perf", "--budget", "standard", "--title", "Perf Ceiling", target], {
  env: {
    PATH: `${wrapperDir}${path.delimiter}${process.env.PATH || ""}`,
  },
});
assert(result.status === 0, `new-task --module perf ceiling fixture should pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);

const gitCommands = fs.readFileSync(gitLog, "utf8").trim().split(/\r?\n/).filter(Boolean);
const verifyCommands = gitCommands.filter((command) => command.startsWith("rev-parse --verify "));
assert(gitCommands.length <= 80, `module new-task should stay under the CI git-call ceiling; got ${gitCommands.length}\nTop commands:\n${topGitCommands(gitCommands)}`);
assert(verifyCommands.length === 0, `default module new-task must not audit historical review commits; got ${verifyCommands.length} rev-parse --verify calls`);

const batchListPath = path.join(wrapperDir, "batch-tasks.json");
fs.writeFileSync(
  batchListPath,
  `${JSON.stringify({
    tasks: [1, 2, 3, 4, 5].map((index) => ({
      id: `perf-batch-${index}`,
      title: `Perf Batch ${index}`,
    })),
  }, null, 2)}\n`,
);
fs.writeFileSync(gitLog, "");
const beforeBatchHead = gitOutput(target, ["rev-parse", "HEAD"]);
const batchResult = run(["new-task-batch", "--task-list", batchListPath, "--module", "perf", "--budget", "standard", target], {
  env: {
    PATH: `${wrapperDir}${path.delimiter}${process.env.PATH || ""}`,
  },
});
assert(batchResult.status === 0, `new-task-batch perf fixture should pass\nSTDOUT:\n${batchResult.stdout}\nSTDERR:\n${batchResult.stderr}`);
const batchPayload = JSON.parse(batchResult.stdout) as { governance?: { commit?: { committed?: boolean } }; tasks?: unknown[] };
assert(batchPayload.governance?.commit?.committed === true, "new-task-batch should commit the batch once");
assert((batchPayload.tasks || []).length === 5, "new-task-batch should report every created task");
const batchCommitCount = Number(gitOutput(target, ["rev-list", "--count", `${beforeBatchHead}..HEAD`]));
assert(batchCommitCount === 1, `new-task-batch should create exactly one commit; got ${batchCommitCount}`);
assert(gitOutput(target, ["log", "-1", "--format=%s"]) === "chore(harness): register 5 tasks", "new-task-batch commit subject should describe the batch");
const batchGitCommands = fs.readFileSync(gitLog, "utf8").trim().split(/\r?\n/).filter(Boolean);
const batchVerifyCommands = batchGitCommands.filter((command) => command.startsWith("rev-parse --verify "));
const batchIdentityCommands = batchGitCommands.filter((command) => command === "config --get user.name" || command === "config --get user.email");
assert(batchGitCommands.length <= 180, `new-task-batch should stay under the CI git-call ceiling; got ${batchGitCommands.length}\nTop commands:\n${topGitCommands(batchGitCommands)}`);
assert(batchVerifyCommands.length === 0, `default new-task-batch must not audit historical review commits; got ${batchVerifyCommands.length} rev-parse --verify calls`);
assert(batchIdentityCommands.length <= 2, `new-task-batch should share Git identity facts within one CLI process; got ${batchIdentityCommands.length} identity config calls\nTop commands:\n${topGitCommands(batchGitCommands)}`);

const aliasCollisionListPath = path.join(wrapperDir, "batch-alias-collision.json");
fs.writeFileSync(
  aliasCollisionListPath,
  `${JSON.stringify({ tasks: [{ id: "perf-alias", title: "Alias" }, { id: `${todayLocal}-perf-alias`, title: "Dated Alias" }] }, null, 2)}\n`,
);
const beforeAliasCollisionHead = gitOutput(target, ["rev-parse", "HEAD"]);
const aliasCollisionResult = run(["new-task-batch", "--task-list", aliasCollisionListPath, "--module", "perf", "--budget", "standard", target]);
assert(aliasCollisionResult.status !== 0, "new-task-batch should reject task ids that resolve to the same final task directory");
assert(gitOutput(target, ["rev-parse", "HEAD"]) === beforeAliasCollisionHead, "new-task-batch alias collision should not create a commit");
assert(!fs.existsSync(path.join(target, `coding-agent-harness/planning/modules/perf/tasks/${todayLocal}-perf-alias`)), "new-task-batch alias collision should fail before writing task directories");

const collisionListPath = path.join(wrapperDir, "batch-collision.json");
fs.writeFileSync(
  collisionListPath,
  `${JSON.stringify({ tasks: [{ id: "perf-batch-1", title: "Existing" }, { id: "perf-batch-collision-new", title: "Should Not Write" }] }, null, 2)}\n`,
);
const beforeCollisionHead = gitOutput(target, ["rev-parse", "HEAD"]);
const collisionResult = run(["new-task-batch", "--task-list", collisionListPath, "--module", "perf", "--budget", "standard", target]);
assert(collisionResult.status !== 0, "new-task-batch should reject existing target tasks before writing");
assert(gitOutput(target, ["rev-parse", "HEAD"]) === beforeCollisionHead, "new-task-batch collision preflight should not create a commit");
assert(!fs.existsSync(path.join(target, `coding-agent-harness/planning/modules/perf/tasks/${todayLocal}-perf-batch-collision-new`)), "new-task-batch collision preflight should not write later task directories");

const stagedOutsideListPath = path.join(wrapperDir, "batch-staged-outside.json");
fs.writeFileSync(stagedOutsideListPath, `${JSON.stringify({ tasks: [{ id: "perf-staged-outside", title: "Staged Outside" }] }, null, 2)}\n`);
fs.writeFileSync(path.join(target, "STAGED_OUTSIDE.txt"), "staged outside\n");
git(target, ["add", "STAGED_OUTSIDE.txt"]);
const beforeStagedOutsideHead = gitOutput(target, ["rev-parse", "HEAD"]);
const stagedOutsideResult = run(["new-task-batch", "--task-list", stagedOutsideListPath, "--module", "perf", "--budget", "standard", target]);
assert(stagedOutsideResult.status !== 0, "new-task-batch should reject staged files outside the batch write scope");
assert(gitOutput(target, ["rev-parse", "HEAD"]) === beforeStagedOutsideHead, "new-task-batch staged-outside rejection should not create a commit");
assert(!fs.existsSync(path.join(target, `coding-agent-harness/planning/modules/perf/tasks/${todayLocal}-perf-staged-outside`)), "new-task-batch staged-outside rejection should fail before writing task directories");
git(target, ["reset", "--", "STAGED_OUTSIDE.txt"]);
fs.rmSync(path.join(target, "STAGED_OUTSIDE.txt"));

const unrelatedDirtyListPath = path.join(wrapperDir, "batch-unrelated-dirty.json");
fs.writeFileSync(unrelatedDirtyListPath, `${JSON.stringify({ tasks: [{ id: "perf-unrelated-dirty-a", title: "Unrelated Dirty A" }, { id: "perf-unrelated-dirty-b", title: "Unrelated Dirty B" }] }, null, 2)}\n`);
fs.writeFileSync(path.join(target, "UNRELATED_DIRTY.txt"), "unrelated dirty\n");
const unrelatedDirtyResult = run(["new-task-batch", "--task-list", unrelatedDirtyListPath, "--module", "perf", "--budget", "standard", target]);
assert(unrelatedDirtyResult.status === 0, `new-task-batch should allow unrelated unstaged dirty files and leave them untouched\nSTDOUT:\n${unrelatedDirtyResult.stdout}\nSTDERR:\n${unrelatedDirtyResult.stderr}`);
const unrelatedStatus = gitOutput(target, ["status", "--short"]);
assert(unrelatedStatus.includes("?? UNRELATED_DIRTY.txt"), `new-task-batch should leave unrelated dirty file uncommitted; status was:\n${unrelatedStatus}`);
fs.rmSync(path.join(target, "UNRELATED_DIRTY.txt"));

console.log("CLI write performance tests passed");

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

function gitOutput(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result.stdout.trim();
}

function topGitCommands(commands: string[]): string {
  const counts = new Map<string, number>();
  for (const command of commands) {
    const verb = command.split(/\s+/)[0] || command;
    counts.set(verb, (counts.get(verb) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([verb, count]) => `${count} ${verb}`)
    .join("\n");
}
