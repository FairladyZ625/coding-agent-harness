#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assert,
  expectJson,
  repoRoot,
  run,
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

console.log("CLI write performance tests passed");

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
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
