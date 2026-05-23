import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const packageVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
export const node = process.execPath;
export const cli = path.join(repoRoot, "scripts/harness.mjs");
export const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-v1-"));
export const todayLocal = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
})();

export function run(args, options = {}) {
  return spawnSync(node, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function expectPass(args) {
  const result = run(args);
  assert(result.status === 0, `${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

export function expectJson(args) {
  return JSON.parse(expectPass(args).stdout);
}

export function waitForWorkbench(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`workbench did not start\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    }, 8000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/(?:dashboard workbench|harness dev):\s+(http:\/\/127\.0\.0\.1:\d+\/)\s+csrf=([a-f0-9]+)/i);
      if (!match) return;
      clearTimeout(timer);
      resolve({ url: match[1], csrf: match[2], stdout, stderr });
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`workbench exited with ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
      }
    });
  });
}

export async function waitForCondition(fn, message, { timeout = 8000, interval = 200 } = {}) {
  const started = Date.now();
  let lastValue;
  while (Date.now() - started < timeout) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`${message}: ${JSON.stringify(lastValue)}`);
}

export function commandExists(command) {
  const result = spawnSync(command, ["-v"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

export function runInTty(args, options = {}) {
  const input = options.input || "";
  const timeout = options.timeout;
  const expectLines = [
    `set timeout ${Math.ceil((timeout || 5000) / 1000)}`,
    `spawn ${[node, cli, ...args].map(tclWord).join(" ")}`,
  ];
  if (input) {
    expectLines.push("expect -re {Language \\[1/2}");
    expectLines.push(`send -- ${tclWord(input.replace(/\n/g, "\r"))}`);
  }
  expectLines.push("expect eof");
  expectLines.push("catch wait result");
  expectLines.push("exit [lindex $result 3]");
  return spawnSync("expect", ["-c", expectLines.join("\n")], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
  });
}

export function expectTtyJson(args, options = {}) {
  const result = runInTty(args, options);
  assert(result.status === 0, `tty ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return parseJsonFromOutput(result.stdout);
}

export function parseJsonFromOutput(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  assert(start >= 0 && end > start, `output did not contain JSON\n${output}`);
  return JSON.parse(output.slice(start, end + 1));
}

function tclWord(value) {
  return `{${String(value).replace(/\\/g, "\\\\").replace(/}/g, "\\}")}}`;
}

export function acceptNoLessonCandidate(taskDir) {
  const candidatePath = path.join(taskDir, "lesson_candidates.md");
  let content = fs.readFileSync(candidatePath, "utf8");
  content = content
    .replace("| Task-level status | pending-review |", "| Task-level status | no-candidate-accepted |")
    .replace("| Review decision | pending-human-review |", "| Review decision | accepted-no-candidate |")
    .replace("| Closeout token | pending |", "| Closeout token | checked-candidate:LC-TEST-000 |")
    .replace(
      "Not decided yet. Fill this only when review accepts that the task produced no reusable lesson candidate.",
      "Human review accepted that this fixture produced no reusable lesson candidate.",
    )
    .replace("尚未判定。只有人工审查接受本任务没有可复用候选时，才填写这里。", "人工审查已接受该测试夹具没有可复用教训候选。");
  fs.writeFileSync(candidatePath, content);
}

export function hasLocalAbsolutePath(content) {
  return /(?:^|[\s"'(])(?:\/Users\/|\/Volumes\/|\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/home\/|[A-Za-z]:\\)/.test(content);
}

export function assertGraphIntegrity(graph, label) {
  const nodes = new Set((graph.nodes || []).map((node) => node.id));
  for (const edge of graph.edges || []) {
    assert(nodes.has(edge.from), `${label} has dangling edge source ${edge.from}`);
    assert(nodes.has(edge.to), `${label} has dangling edge target ${edge.to}`);
  }
}
