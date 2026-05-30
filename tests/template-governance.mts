#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const chineseCharacterPattern = /\p{Script=Han}/u;
const brokenMechanicalTemplatePattern = /\bfill in(?:[A-Z]|\w)|(?:[a-z])fill in\b|TODO/;
const staleDispositionPattern = /\b((?:open\s*\/\s*)?fixed\s*\/\s*accepted\s*\/\s*deferred\s*\/\s*n\/a|accepted[- ]residuals?|accepted\s+(?:with|as)\s+residual|accepted\s+by\s+owner|accepted\s+waiver)\b/i;
const sampleOpenFindingPattern = /^\|\s*(?:F|R|SR|V|RR|HL)-\d+\s*\|.*\|\s*(?:open|yes\s*\|\s*open|yes\s*\/\s*no\s*\|\s*open)\s*\|?\s*$/im;
const englishFirstZhHeadingPattern = /^#{1,6}\s+(?:Reviewer Identity|Confidence Challenge|Material Findings|Non-Material Notes|Evidence Checked|Final Confidence Basis|Follow-Up Routing|Phase Graph|Phase Table|Context Packet|Artifact Index|Stop Condition|Pause Conditions|Deliverables|Module Session Prompt|Subagent\s*\/\s*Worker|Coordinator|Worktree|Slice ID|Parent Phase|Inputs|Verifier\b|Harness\b|Closeout\b|Lessons\b)/m;
const zhMechanicalEnglishWorkflowPattern = /^\s*\d+\.\s*(?:implement|run locally|self-review|rerun evidence)\b/im;
const zhMechanicalEvidencePhrasePattern = /\b(?:local smoke|browser or UI inspection|live environment smoke|reviewer findings|PR checks\s*\/\s*workflow run)\b/i;
type PathTokenAllowlistEntry = {
  file: string;
  classification?: string;
  reason?: string;
};
type PathTokenAllowlist = {
  allowed?: PathTokenAllowlistEntry[];
};

const pathTokenAllowlist = (JSON.parse(fs.readFileSync(path.join(repoRoot, "tests/fixtures/path-token-allowlist.json"), "utf8")) as PathTokenAllowlist).allowed || [];
const allowedPathTokenFiles = new Set(pathTokenAllowlist.map((entry) => entry.file));
const manualLifecycleTablePatterns = [
  /Feature SSoT entry/i,
  /Feature SSoT:\s*`?docs\/09-PLANNING\/Feature-SSoT\.md`?/i,
  /Feature SSoT：\s*`?docs\/09-PLANNING\/Feature-SSoT\.md`?/i,
  /writes? back to Feature SSoT/i,
  /route it through Feature SSoT/i,
  /must simultaneously update progress\.md and Feature SSoT/i,
  /whether to write back to Feature SSoT/i,
  /回写到 Feature SSoT/i,
  /回写 Feature SSoT/i,
  /是否回写 Feature SSoT/i,
  /必须同时更新 progress\.md 和 Feature SSoT/i,
  /功能 SSoT 条目/,
  /功能进度写入 Feature SSoT/,
];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const skillContent = fs.readFileSync(path.join(repoRoot, "SKILL.md"), "utf8");
assert(!skillContent.includes("Historical 12-Phase Bootstrap"), "SKILL.md should not carry the legacy 12-phase reference body");
assert(
  skillContent.includes("references/legacy-12-phase-bootstrap.md"),
  "SKILL.md should route legacy bootstrap details to the reference document",
);
assert(
  fs.readFileSync(path.join(repoRoot, "references/legacy-12-phase-bootstrap.md"), "utf8").includes("Historical 12-Phase Bootstrap"),
  "legacy 12-phase bootstrap reference should exist",
);

const englishTemplateFiles = relativeFiles(path.join(repoRoot, "templates"));
const chineseTemplateFiles = relativeFiles(path.join(repoRoot, "templates-zh-CN"));
const englishNonDashboardTemplateFiles = englishTemplateFiles.filter((file) => !file.startsWith("dashboard/"));
const chineseNonDashboardTemplateFiles = chineseTemplateFiles.filter((file) => !file.startsWith("dashboard/"));
assert(englishTemplateFiles.length > 0, "templates/ should contain English templates");
assert(chineseTemplateFiles.length > 0, "templates-zh-CN should contain Chinese templates");
assert(
  JSON.stringify(englishNonDashboardTemplateFiles) === JSON.stringify(chineseNonDashboardTemplateFiles),
  "templates/ and templates-zh-CN/ should expose the same non-dashboard template file set",
);
assert(!chineseTemplateFiles.some((file) => file.startsWith("dashboard/")), "templates-zh-CN/dashboard should be removed; dashboard uses runtime i18n");
for (const relativeFile of englishNonDashboardTemplateFiles) {
  const content = fs.readFileSync(path.join(repoRoot, "templates", relativeFile), "utf8");
  assert(!chineseCharacterPattern.test(content), `English template contains Chinese text: ${relativeFile}`);
  assert(!brokenMechanicalTemplatePattern.test(content), `English template contains mechanical placeholder text: ${relativeFile}`);
  assert(!staleDispositionPattern.test(content), `English template contains stale disposition vocabulary: ${relativeFile}`);
  assert(!sampleOpenFindingPattern.test(content), `English template contains a real open sample finding row: ${relativeFile}`);
}
assert(
  fs.readFileSync(path.join(repoRoot, "templates-zh-CN", "AGENTS.md.template"), "utf8").includes("项目概况"),
  "templates-zh-CN should provide Chinese AGENTS.md content",
);
const agentsTemplate = fs.readFileSync(path.join(repoRoot, "templates", "AGENTS.md.template"), "utf8");
assert(agentsTemplate.includes("no-commit reason"), "English AGENTS template should require a no-commit reason when a verified slice is not committed");
assert(agentsTemplate.includes("dirty ownership"), "English AGENTS template should name dirty ownership as a commit deferral condition");
assert(agentsTemplate.includes("unrelated dirty changes"), "English AGENTS template should forbid mixing unrelated dirty changes into commits");
const zhAgentsTemplate = fs.readFileSync(path.join(repoRoot, "templates-zh-CN", "AGENTS.md.template"), "utf8");
assert(zhAgentsTemplate.includes("no-commit reason"), "Chinese AGENTS template should require a no-commit reason when a verified slice is not committed");
assert(zhAgentsTemplate.includes("归属不清"), "Chinese AGENTS template should name unclear dirty ownership as a commit deferral condition");
for (const relativeFile of englishOutcomeFirstBriefTemplates()) {
  const content = fs.readFileSync(path.join(repoRoot, relativeFile), "utf8");
  assert(content.includes("## Outcome Statement"), `${relativeFile} should lead with an outcome statement section`);
  assert(content.includes("## Outcome Value"), `${relativeFile} should explain what the user or project gets when complete`);
  assert(content.includes("## Deliverables"), `${relativeFile} should identify visible deliverables`);
  assert(content.indexOf("## Outcome Statement") < content.indexOf("## Deliverables"), `${relativeFile} should put outcome before deliverables`);
}
for (const relativeFile of chineseOutcomeFirstBriefTemplates()) {
  const content = fs.readFileSync(path.join(repoRoot, relativeFile), "utf8");
  assert(content.includes("## 一句话结果"), `${relativeFile} should lead with a Chinese one-sentence outcome section`);
  assert(content.includes("## 完成后能得到什么"), `${relativeFile} should explain what the user or project gets when complete`);
  assert(content.includes("## 交付物"), `${relativeFile} should identify visible deliverables`);
  assert(content.indexOf("## 一句话结果") < content.indexOf("## 交付物"), `${relativeFile} should put outcome before deliverables`);
}
const englishModuleRegistryTemplate = fs.readFileSync(path.join(repoRoot, "templates/ssot/Module-Registry.md"), "utf8");
const chineseModuleRegistryTemplate = fs.readFileSync(path.join(repoRoot, "templates-zh-CN/ssot/Module-Registry.md"), "utf8");
assert(englishModuleRegistryTemplate.includes("Generated from `harness.yaml` `modules.items`"), "English Module Registry template should be a generated view stub");
assert(chineseModuleRegistryTemplate.includes("由 `harness.yaml` `modules.items` 生成"), "Chinese Module Registry template should mirror the generated view stub");
assert(chineseModuleRegistryTemplate.includes("不要直接编辑此视图"), "Chinese Module Registry template should warn against direct edits");
assert(!chineseModuleRegistryTemplate.includes("共享范围 / 锁"), "Chinese Module Registry template should not keep the retired hand-maintained registry sections");
const chinesePlanningIndex = fs.readFileSync(path.join(repoRoot, "templates-zh-CN/planning/INDEX.md"), "utf8");
assert(chinesePlanningIndex.includes("`walkthrough.md` | 任务本地 closeout 摘要"), "Chinese planning index should list walkthrough.md in core contract files");
assertTemplateHeadingParity({
  englishPath: "templates/planning/optional/slices/_slice-template/brief.md",
  chinesePath: "templates-zh-CN/planning/optional/slices/_slice-template/brief.md",
  expectedCount: 10,
});
const chineseSliceBrief = fs.readFileSync(path.join(repoRoot, "templates-zh-CN/planning/optional/slices/_slice-template/brief.md"), "utf8");
assert(!chineseSliceBrief.includes("## 输入"), "Chinese slice brief should not keep extra Inputs section absent from English template");
assert(!chineseSliceBrief.includes("## 关闭条件"), "Chinese slice brief should not keep extra close conditions section absent from English template");
assert(chineseSliceBrief.includes("| 证据 | 命令 / 路径 | 必需 |"), "Chinese slice brief should mirror the Required Evidence table structure");
for (const relativeFile of chineseNonDashboardTemplateFiles) {
  const content = fs.readFileSync(path.join(repoRoot, "templates-zh-CN", relativeFile), "utf8");
  assert(!brokenMechanicalTemplatePattern.test(content), `Chinese template contains mechanical placeholder text: ${relativeFile}`);
  assert(!staleDispositionPattern.test(content), `Chinese template contains stale disposition vocabulary: ${relativeFile}`);
  assert(!sampleOpenFindingPattern.test(content), `Chinese template contains a real open sample finding row: ${relativeFile}`);
  assert(!englishFirstZhHeadingPattern.test(content), `Chinese template contains English-first review heading: ${relativeFile}`);
  assert(!zhMechanicalEnglishWorkflowPattern.test(content), `Chinese template contains unlocalized workflow phrase: ${relativeFile}`);
  assert(!zhMechanicalEvidencePhrasePattern.test(content), `Chinese template contains unlocalized evidence phrase: ${relativeFile}`);
}
for (const relativeFile of lifecycleContractFiles()) {
  const content = fs.readFileSync(path.join(repoRoot, relativeFile), "utf8");
  for (const pattern of manualLifecycleTablePatterns) {
    assert(!pattern.test(content), `${relativeFile} still instructs agents to manually maintain Feature SSoT lifecycle tables: ${pattern}`);
  }
}
for (const relativeFile of lowEntropyTombstoneContractFiles()) {
  const content = fs.readFileSync(path.join(repoRoot, relativeFile), "utf8");
  assert(!/\babandoned\s+(?:marker|state|status)\b/i.test(content), `${relativeFile} must treat abandoned as a tombstone reason, not a durable state or marker`);
  assert(!/废弃状态/.test(content), `${relativeFile} must treat 废弃 as a tombstone reason, not a durable state`);
}

const staleRuntimePathOffenders = [];
for (const relativeFile of pathTokenGovernedFiles()) {
  if (allowedPathTokenFiles.has(relativeFile)) continue;
  const content = fs.readFileSync(path.join(repoRoot, relativeFile), "utf8");
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (/\bcoding-agent-harness\/(?:planning|governance|context)\//.test(line)) {
      staleRuntimePathOffenders.push(`${relativeFile}:${index + 1}: ${line.trim()}`);
    }
    const tokenMatches = [...line.matchAll(/\{\{\s*paths\.([A-Za-z0-9_.-]+)\s*\}\}/g)];
    for (const match of tokenMatches) {
      if (!["harnessRoot", "planningRoot", "tasksRoot", "modulesRoot", "externalRoot", "governanceRoot", "generatedRoot", "regressionRoot", "ledgerPath", "closeoutIndexPath"].includes(match[1])) {
        staleRuntimePathOffenders.push(`${relativeFile}:${index + 1}: unknown path token ${match[0]}`);
      }
    }
  }
}
assert(staleRuntimePathOffenders.length === 0, `runtime templates and presets must use {{paths.*}} or an allowlist entry:\n${staleRuntimePathOffenders.join("\n")}`);
for (const entry of pathTokenAllowlist) {
  assert(fs.existsSync(path.join(repoRoot, entry.file)), `path token allowlist entry points at a missing file: ${entry.file}`);
  assert(Boolean(entry.classification && entry.reason), `path token allowlist entry must include classification and reason: ${entry.file}`);
}

function relativeFiles(root: string): string[] {
  const results: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        results.push(toPosix(path.relative(root, full)));
      }
    }
  }
  walk(root);
  return results.sort();
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function assertTemplateHeadingParity({ englishPath, chinesePath, expectedCount }: { englishPath: string; chinesePath: string; expectedCount: number }): void {
  const englishHeadings = markdownH2Headings(fs.readFileSync(path.join(repoRoot, englishPath), "utf8"));
  const chineseHeadings = markdownH2Headings(fs.readFileSync(path.join(repoRoot, chinesePath), "utf8"));
  assert(englishHeadings.length === expectedCount, `${englishPath} should have ${expectedCount} H2 sections`);
  assert(chineseHeadings.length === expectedCount, `${chinesePath} should have ${expectedCount} H2 sections`);
}

function markdownH2Headings(content: string): string[] {
  return content.split(/\r?\n/).filter((line) => /^##\s+/.test(line));
}

function lifecycleContractFiles(): string[] {
  return [
    "SKILL.md",
    "templates/AGENTS.md.template",
    "templates-zh-CN/AGENTS.md.template",
    "templates/planning/task_plan.md",
    "templates-zh-CN/planning/task_plan.md",
    "templates/ledger/Harness-Ledger.md",
    "templates-zh-CN/ledger/Harness-Ledger.md",
    "references/planning-loop.md",
    "references/harness-ledger.md",
    "references/ssot-governance.md",
    "docs-release/guides/migration-playbook.md",
    "docs-release/guides/migration-playbook.en-US.md",
  ];
}

function lowEntropyTombstoneContractFiles(): string[] {
  return [
    "docs-release/guides/task-state-machine.md",
    "docs-release/guides/task-state-machine.en-US.md",
    "templates/planning/review.md",
    "templates-zh-CN/planning/review.md",
    "templates/dashboard/assets/i18n.js",
  ];
}

function englishOutcomeFirstBriefTemplates(): string[] {
  return [
    "templates/planning/brief.md",
    "templates/planning/module_brief.md",
    "templates/modules/module_brief.md",
    "templates/planning/optional/slices/_slice-template/brief.md",
    "skills/preset-creator/references/complex-task-skeleton/brief.md",
  ];
}

function chineseOutcomeFirstBriefTemplates(): string[] {
  return [
    "templates-zh-CN/planning/brief.md",
    "templates-zh-CN/planning/module_brief.md",
    "templates-zh-CN/modules/module_brief.md",
    "templates-zh-CN/planning/optional/slices/_slice-template/brief.md",
  ];
}

function pathTokenGovernedFiles(): string[] {
  return [
    ...relativeFiles(path.join(repoRoot, "templates")).map((file) => `templates/${file}`),
    ...relativeFiles(path.join(repoRoot, "templates-zh-CN")).map((file) => `templates-zh-CN/${file}`),
    ...relativeFiles(path.join(repoRoot, "presets")).map((file) => `presets/${file}`),
  ].filter((file) => /\.(md|mjs|js|json|yaml|yml|template)$/.test(file));
}

console.log("Template governance tests passed");
