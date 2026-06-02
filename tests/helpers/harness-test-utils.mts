import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";
import type { HarnessTestLooseJson, WorkbenchRuntime, ZipFixtureEntry } from "./harness-test-types.js";

type TestRunOptions = Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> & {
  encoding?: BufferEncoding;
};

type TtyRunOptions = TestRunOptions & {
  input?: string;
  timeout?: number;
};

type WorkbenchChild = {
  kill(signal?: NodeJS.Signals): boolean;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  on(event: "exit", listener: (code: number | null) => void): unknown;
};

type GraphLike = {
  nodes?: Array<{ id: string }>;
  edges?: Array<{ from: string; to: string }>;
};

export const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const packageVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
export const node = process.execPath;
export const cli = path.join(repoRoot, "dist/harness.mjs");
export const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-v1-"));
export const todayLocal = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
})();

export function run(args: string[], options: TestRunOptions = {}): SpawnSyncReturns<string> {
  return spawnSync(node, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...humanControlledTestEnv(), ...(options.env || {}) },
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

export function humanControlledTestEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HARNESS_ACTOR: "human", ...overrides };
  for (const key of Object.keys(env)) {
    if (/^(CODEX|CLAUDE_CODE)(_|$)/.test(key)) delete env[key];
  }
  return env;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function expectPass(args: string[], options: TestRunOptions = {}): SpawnSyncReturns<string> {
  const result = run(args, options);
  assert(result.status === 0, `${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

export function expectJson<TPayload = HarnessTestLooseJson>(args: string[], options: TestRunOptions = {}): TPayload {
  return JSON.parse(expectPass(args, options).stdout) as TPayload;
}

export function waitForWorkbench(child: WorkbenchChild): Promise<WorkbenchRuntime> {
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

export async function waitForCondition<TValue>(
  fn: () => TValue | Promise<TValue>,
  message: string,
  { timeout = 8000, interval = 200 }: { timeout?: number; interval?: number } = {},
): Promise<NonNullable<TValue>> {
  const started = Date.now();
  let lastValue: TValue | undefined;
  while (Date.now() - started < timeout) {
    lastValue = await fn();
    if (lastValue) return lastValue as NonNullable<TValue>;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`${message}: ${JSON.stringify(lastValue)}`);
}

export function commandExists(command: string): boolean {
  const result = spawnSync(command, ["-v"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

export function writeZipFromDirectory(sourceDir: string, zipPath: string, { rootName = path.basename(sourceDir) }: { rootName?: string } = {}): void {
  const entries: ZipFixtureEntry[] = [];
  const visit = (directory: string, prefix = ""): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) entries.push({ name: path.posix.join(rootName, relative), data: fs.readFileSync(absolute) });
    }
  };
  visit(sourceDir);
  writeZipEntries(entries, zipPath, { method: 8 });
}

export function runInTty(args: string[], options: TtyRunOptions = {}): SpawnSyncReturns<string> {
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
    env: { ...humanControlledTestEnv(), ...(options.env || {}) },
    timeout,
  });
}

export function expectTtyJson<TPayload = HarnessTestLooseJson>(args: string[], options: TtyRunOptions = {}): TPayload {
  const result = runInTty(args, options);
  assert(result.status === 0, `tty ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return parseJsonFromOutput<TPayload>(result.stdout);
}

export function parseJsonFromOutput<TPayload = HarnessTestLooseJson>(output: string): TPayload {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  assert(start >= 0 && end > start, `output did not contain JSON\n${output}`);
  return JSON.parse(output.slice(start, end + 1)) as TPayload;
}

function tclWord(value: string): string {
  return `{${String(value).replace(/\\/g, "\\\\").replace(/}/g, "\\}")}}`;
}

export function writeZipEntries(entries: ZipFixtureEntry[], zipPath: string, { method = 0 }: { method?: 0 | 8 } = {}): void {
  const fileRecords = [];
  const localParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const entryMethod = entry.method ?? method;
    const compressed = entry.compressedData ? Buffer.from(entry.compressedData) : entryMethod === 8 ? zlib.deflateRawSync(data) : data;
    const compressedSize = entry.compressedSize ?? compressed.length;
    const uncompressedSize = entry.uncompressedSize ?? data.length;
    const flags = entry.flags ?? 0x0800;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(entryMethod, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);
    fileRecords.push({ name, crc, compressedSize, uncompressedSize, method: entryMethod, flags, externalAttributes: entry.externalAttributes || 0, offset });
    offset += local.length + name.length + compressed.length;
  }
  const centralParts = [];
  for (const record of fileRecords) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(record.flags, 8);
    central.writeUInt16LE(record.method, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(record.crc, 16);
    central.writeUInt32LE(record.compressedSize, 20);
    central.writeUInt32LE(record.uncompressedSize, 24);
    central.writeUInt16LE(record.name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(record.externalAttributes, 38);
    central.writeUInt32LE(record.offset, 42);
    centralParts.push(central, record.name);
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileRecords.length, 8);
  eocd.writeUInt16LE(fileRecords.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  fs.writeFileSync(zipPath, Buffer.concat([...localParts, ...centralParts, eocd]));
}

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function acceptNoLessonCandidate(taskDir: string): void {
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

export function sanitizeTemplateFixtureMaterials(taskDir: string): void {
  for (const fileName of ["brief.md", "task_plan.md", "execution_strategy.md", "visual_map.md", "progress.md", "findings.md", "review.md", "walkthrough.md"]) {
    const filePath = path.join(taskDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, "utf8");
    content = content
      .replace(/One sentence stating the concrete result this task must produce\./g, "This fixture validates lifecycle behavior with concrete task materials.")
      .replace(/用一句话说明这个任务完成后会产生什么具体结果。/g, "该测试夹具用于验证生命周期行为，材料内容已具体化。")
      .replace(/说明这个任务完成后，用户或项目能直接看到的结果。/g, "该测试夹具用于验证生命周期行为，材料内容已具体化。")
      .replace(/State the first concrete action before implementation starts\./g, "Create the fixture task and submit it for review.")
      .replace(/写明开始实现前的第一个具体动作。/g, "创建测试任务并推进到审查状态。")
      .replace(/开始实现前，把这里替换成第一个具体动作。/g, "创建测试任务并推进到审查状态。")
      .replace(/Scoped implementation, document update, and verification evidence/g, "Concrete fixture implementation and verification evidence")
      .replace(/有边界的实现、文档切片和验证证据/g, "测试夹具实现和验证证据已具体化")
      .replace(/diff, commands, worker handoff, or artifact path/g, "command:test and fixture diff evidence")
      .replace(/diff、commands、worker handoff 或 artifact path/g, "command:test 和测试夹具 diff 证据")
      .replace(/\[action taken\]/g, "fixture action recorded")
      .replace(/\[what was checked and what it showed\]/g, "fixture check passed with concrete evidence")
      .replace(/\[检查了什么，结论是什么\]/g, "测试夹具检查已通过并记录具体证据")
      .replace(/^(?:Pending closeout\.|待收口。)\s*$/gim, "Closeout evidence recorded for this fixture.")
      .replace(/\[(?:[^\]\n]*(?:用一句话|本轮|说明|为什么|步骤|标准|路径|分支|负责人|什么时候|阶段名称|具体操作|验证|下一步|遗留问题|审查范围|文件、模块|风险|证据|发现主题|当前可用判断|State the|specific files|First concrete step|Observable criterion|path or command|what was checked|generated by|timestamp|number|risk|owner)[^\]\n]*)\]/gi, "fixture-concrete")
      .replace(/^\|\s*pending\s*\|\s*pending\s*\|\s*(?:not run|pending)\s*\|\s*pending\s*\|$/gim, "| fixture-check | passed | command:test | fixture evidence |")
      .replace(/^\|[^\n|]*worker subagent[^\n]*\|$/gim, "| worker subagent | not-needed | not-needed | not-needed | not-needed | fixture-local |");
    fs.writeFileSync(filePath, content);
  }
}

export function hasLocalAbsolutePath(content: string): boolean {
  return /(?:^|[\s"'(])(?:\/Users\/|\/Volumes\/|\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/home\/|[A-Za-z]:\\)/.test(content);
}

export function assertGraphIntegrity(graph: GraphLike, label: string): void {
  const nodes = new Set((graph.nodes || []).map((node) => node.id));
  for (const edge of graph.edges || []) {
    assert(nodes.has(edge.from), `${label} has dangling edge source ${edge.from}`);
    assert(nodes.has(edge.to), `${label} has dangling edge target ${edge.to}`);
  }
}
