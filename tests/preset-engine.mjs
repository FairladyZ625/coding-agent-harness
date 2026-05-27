#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { assert, expectJson, expectPass, run, tmpRoot, todayLocal, writeZipEntries, writeZipFromDirectory, } from "./helpers/harness-test-utils.mjs";
assert(fs.existsSync(path.join(repoRootFromTest(), "docs-release/guides/preset-development.md")), "preset development guide should exist");
assert(fs.existsSync(path.join(repoRootFromTest(), "skills/preset-creator/SKILL.md")), "preset creator skill should exist");
assert(fs.existsSync(path.join(repoRootFromTest(), "skills/preset-creator/references/preset-package-skeleton.md")), "preset creator skill should include a package skeleton reference");
const readmeEn = fs.readFileSync(path.join(repoRootFromTest(), "README.md"), "utf8");
const readmeZh = fs.readFileSync(path.join(repoRootFromTest(), "README.zh-CN.md"), "utf8");
const agentGuideEn = fs.readFileSync(path.join(repoRootFromTest(), "docs-release/guides/agent-installation.en-US.md"), "utf8");
const agentGuideZh = fs.readFileSync(path.join(repoRootFromTest(), "docs-release/guides/agent-installation.md"), "utf8");
for (const doc of [readmeEn, readmeZh, agentGuideEn, agentGuideZh]) {
    assert(doc.includes("--skill preset-creator"), "public docs should show how to install the preset creator skill");
    assert(doc.includes("--full-depth"), "public docs should explain full-depth discovery for nested skills");
}
assert(readmeEn.includes("A preset is a versioned, declarative task method package"), "English README should explain what a preset is");
assert(readmeEn.includes("The `preset-creator` Skill is for authoring these preset packages"), "English README should distinguish preset authoring from CLI application");
assert(readmeZh.includes("Preset 是一个可版本化、声明式的任务方法包"), "Chinese README should explain what a preset is");
assert(readmeZh.includes("`preset-creator` Skill 用来制作"), "Chinese README should distinguish preset authoring from CLI application");
const presetCreatorSkill = fs.readFileSync(path.join(repoRootFromTest(), "skills/preset-creator/SKILL.md"), "utf8");
assert(presetCreatorSkill.includes("description: Use when"), "preset creator skill description should be trigger-oriented for skill discovery");
assert(presetCreatorSkill.includes("references/preset-package-skeleton.md"), "preset creator skill should route agents to the package skeleton reference");
const complexSkillSkeletonFiles = [
    "README.md",
    "brief.md",
    "task_plan.md",
    "execution_strategy.md",
    "visual_map.md",
    "findings.md",
    "lesson_candidates.md",
    "progress.md",
    "review.md",
    "references/INDEX.md",
    "artifacts/INDEX.md",
    "long-running-task-contract.md",
];
for (const file of complexSkillSkeletonFiles) {
    assert(fs.existsSync(path.join(repoRootFromTest(), "skills/preset-creator/references/complex-task-skeleton", file)), `preset creator skill should include complex task skeleton file: ${file}`);
}
assert(fs.readFileSync(path.join(repoRootFromTest(), "skills/preset-creator/SKILL.md"), "utf8").includes("references/complex-task-skeleton/"), "preset creator skill should route agents to the complex task skeleton reference");
const presetPackageSkeleton = fs.readFileSync(path.join(repoRootFromTest(), "skills/preset-creator/references/preset-package-skeleton.md"), "utf8");
for (const requiredPhrase of ["Supported input types", "exactly match one `writeScopes", "Preset Required Reads", "evidence.bundleDir", "Do not write `evidence.files` as an array"]) {
    assert(presetCreatorSkill.includes(requiredPhrase) || presetPackageSkeleton.includes(requiredPhrase), `preset creator references should clarify: ${requiredPhrase}`);
}
const home = path.join(tmpRoot, "preset-home");
const env = { ...process.env, HOME: home };
const target = path.join(tmpRoot, "preset-engine-target");
fs.mkdirSync(target);
const initResult = expectJson(["init", "--locale", "en-US", "--capabilities", "core", target], { env });
assert(initResult.presetSeed?.scope === "project", "init should seed bundled presets into the project preset root");
assert(fs.existsSync(path.join(target, ".coding-agent-harness/presets/module/preset.yaml")), "init should install the bundled module preset into the project");
const projectSeededList = expectJson(["preset", "list", "--json", target], { env });
assert(projectSeededList.presets.some((preset) => preset.id === "module" && preset.source === "project"), "project-seeded bundled presets should be discovered before builtin fallback");
const projectSeedAgain = expectJson(["preset", "seed", "--project", "--json", target], { env });
assert(projectSeedAgain.skipped >= 1, "preset seed should be idempotent by default");
const listBefore = expectJson(["preset", "list", "--json"], { env });
const legacyBefore = listBefore.presets.find((preset) => preset.id === "legacy-migration");
assert(legacyBefore?.source === "builtin", "builtin presets should report source=builtin");
const listTextBefore = expectPass(["preset", "list"], { env }).stdout;
assert(listTextBefore.includes("legacy-migration@") && listTextBefore.includes("[builtin]"), "text preset list should show source labels");
assert(listTextBefore.includes(" - "), "text preset list should include preset purpose");
const customSource = path.join(tmpRoot, "custom-review-preset");
fs.mkdirSync(path.join(customSource, "templates"), { recursive: true });
fs.writeFileSync(path.join(customSource, "preset.yaml"), `id: custom-review
version: 1
purpose: Custom review task preset
compatibleBudgets: [standard, complex]
localeSupport: [en-US]
task:
  kind: review-task
  defaultTaskId: custom-review-task
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
inputs:
  subject:
    type: text
    flag: --subject
    required: true
templateValues:
  subject:
    from: inputs.subject
metadata:
  ReviewSubject:
    label: Review Subject
    from: inputs.subject
evidence:
  bundleDir: artifacts/preset
  files:
    subject:
      path: subject.txt
      type: text
      value: inputs.subject
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json, preset-manifest.json, write-scope.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
fs.writeFileSync(path.join(customSource, "templates/task_plan.append.md"), "## Custom Review\n\nSubject: {{subject}}\n");
assert(expectJson(["preset", "check", customSource, "--json"], { env }).source === "local", "preset check should validate local preset directories before install");
const install = expectJson(["preset", "install", customSource, "--force", "--json"], { env });
assert(install.installed === true, "preset install should report installed=true");
assert(install.destination.includes(".coding-agent-harness/presets/custom-review"), "preset install should copy into the user preset directory");
const customArchive = path.join(tmpRoot, "custom-review.zip");
writeZipFromDirectory(customSource, customArchive, { rootName: "custom-review" });
const archiveInstall = expectJson(["preset", "install", customArchive, "--force", "--json"], { env });
assert(archiveInstall.installed === true && archiveInstall.id === "custom-review", "preset install should accept zipped preset packages");
assert(archiveInstall.destination.includes(".coding-agent-harness/presets/custom-review"), "zipped preset install should copy into the user preset directory");
const rootArchive = path.join(tmpRoot, "custom-review-root.zip");
writeZipFromDirectory(customSource, rootArchive, { rootName: "" });
const rootArchiveInstall = expectJson(["preset", "install", rootArchive, "--force", "--json"], { env });
assert(rootArchiveInstall.installed === true && rootArchiveInstall.id === "custom-review", "preset install should accept archives with preset.yaml at the root");
const escapingArchive = path.join(tmpRoot, "escaping-preset.zip");
writeZipEntries([{ name: "../escaping-preset/preset.yaml", data: "id: escaping-preset\nversion: 1\n" }], escapingArchive);
const escapingInstall = run(["preset", "install", escapingArchive, "--force", "--json"], { env });
assert(escapingInstall.status !== 0, "preset install should reject archive entries that escape the extraction root");
assert(`${escapingInstall.stdout}\n${escapingInstall.stderr}`.includes("escapes extraction root"), "archive path escape failure should explain the rejected entry");
const absoluteArchive = path.join(tmpRoot, "absolute-preset.zip");
writeZipEntries([{ name: "/absolute-preset/preset.yaml", data: "id: absolute-preset\nversion: 1\n" }], absoluteArchive);
const absoluteInstall = run(["preset", "install", absoluteArchive, "--force", "--json"], { env });
assert(absoluteInstall.status !== 0, "preset install should reject archive entries with absolute paths");
assert(`${absoluteInstall.stdout}\n${absoluteInstall.stderr}`.includes("must be relative"), "absolute archive path failure should explain the rejected entry");
const encryptedArchive = path.join(tmpRoot, "encrypted-preset.zip");
writeZipEntries([{ name: "encrypted-preset/preset.yaml", data: "id: encrypted-preset\nversion: 1\n", flags: 0x0801 }], encryptedArchive);
const encryptedInstall = run(["preset", "install", encryptedArchive, "--force", "--json"], { env });
assert(encryptedInstall.status !== 0, "preset install should reject encrypted archive entries");
assert(`${encryptedInstall.stdout}\n${encryptedInstall.stderr}`.includes("Encrypted preset archive entries are not supported"), "encrypted archive failure should explain unsupported encryption");
const unsupportedMethodArchive = path.join(tmpRoot, "unsupported-method-preset.zip");
writeZipEntries([{ name: "unsupported-method-preset/preset.yaml", data: "id: unsupported-method-preset\nversion: 1\n", method: 99 }], unsupportedMethodArchive);
const unsupportedMethodInstall = run(["preset", "install", unsupportedMethodArchive, "--force", "--json"], { env });
assert(unsupportedMethodInstall.status !== 0, "preset install should reject unsupported archive compression methods");
assert(`${unsupportedMethodInstall.stdout}\n${unsupportedMethodInstall.stderr}`.includes("Unsupported preset archive compression method"), "unsupported method failure should explain the rejected method");
const symlinkArchive = path.join(tmpRoot, "symlink-preset.zip");
writeZipEntries([{ name: "symlink-preset/preset.yaml", data: "id: symlink-preset\nversion: 1\n", externalAttributes: (0o120000 << 16) >>> 0 }], symlinkArchive);
const symlinkInstall = run(["preset", "install", symlinkArchive, "--force", "--json"], { env });
assert(symlinkInstall.status !== 0, "preset install should reject archive symlink entries");
assert(`${symlinkInstall.stdout}\n${symlinkInstall.stderr}`.includes("must not contain symlinks"), "symlink archive failure should explain the rejected symlink");
const oversizedInflateArchive = path.join(tmpRoot, "oversized-inflate-preset.zip");
writeZipEntries([{ name: "oversized-inflate-preset/preset.yaml", data: Buffer.alloc(1024 * 1024, "a"), method: 8, uncompressedSize: 1 }], oversizedInflateArchive);
const oversizedInflateInstall = run(["preset", "install", oversizedInflateArchive, "--force", "--json"], { env });
assert(oversizedInflateInstall.status !== 0, "preset install should bound zip inflate output before trusting entry data");
assert(`${oversizedInflateInstall.stdout}\n${oversizedInflateInstall.stderr}`.includes("could not be decompressed within its declared size"), "oversized inflate failure should explain decompression bound");
const listAfter = expectJson(["preset", "list", "--json"], { env });
assert(listAfter.presets.some((preset) => preset.id === "custom-review" && preset.source === "user"), "installed preset should be listed with source=user");
const inspect = expectJson(["preset", "inspect", "custom-review", "--json"], { env });
assert(inspect.inputs.subject.flag === "--subject", "preset inspect should expose declarative inputs");
assert(inspect.templateValues.subject.from === "inputs.subject", "preset inspect should expose templateValues");
assert(inspect.metadata.ReviewSubject.from === "inputs.subject", "preset inspect should expose declarative metadata");
assert(inspect.source === "user", "user-installed preset should override builtin discovery source");
assert(path.isAbsolute(inspect.manifestPath), "user preset manifest path should be absolute for agent discovery");
assert(expectJson(["preset", "check", "custom-review", "--json"], { env }).status === "pass", "installed preset should pass preset check");
const projectSource = path.join(tmpRoot, "project-review-preset");
fs.mkdirSync(path.join(projectSource, "templates"), { recursive: true });
fs.writeFileSync(path.join(projectSource, "preset.yaml"), `id: project-review
version: 1
purpose: Project-level review task preset
compatibleBudgets: [standard]
localeSupport: [en-US]
task:
  kind: project-review-task
  defaultTaskId: project-review-task
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
inputs:
  topic:
    type: text
    flag: --topic
    required: true
templateValues:
  topic:
    from: inputs.topic
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
fs.writeFileSync(path.join(projectSource, "templates/task_plan.append.md"), "## Project Review\n\nTopic: {{topic}}\n");
const projectInstall = expectJson(["preset", "install", projectSource, "--project", "--force", "--json", target], { env });
assert(projectInstall.destination.includes(".coding-agent-harness/presets/project-review"), "project preset install should copy into the project preset directory");
const projectList = expectJson(["preset", "list", "--json", target], { env });
assert(projectList.presets.some((preset) => preset.id === "project-review" && preset.source === "project"), "project preset should be listed with source=project when target is supplied");
const projectInspect = expectJson(["preset", "inspect", "project-review", "--json", target], { env });
assert(projectInspect.source === "project", "preset inspect should prefer project presets when target is supplied");
assert(projectInspect.purpose === "Project-level review task preset", "preset inspect should expose project preset purpose");
assert(path.isAbsolute(projectInspect.manifestPath), "project preset manifest path should be absolute for agent discovery");
const projectCreated = expectJson(["new-task", "project-review-task", "--budget", "standard", "--preset", "project-review", "--topic", "Module context", target], { env });
assert(projectCreated.task.kind === "project-review-task", "new-task should resolve project-level preset manifests");
const projectTaskPlan = fs.readFileSync(path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-project-review-task/task_plan.md`), "utf8");
assert(projectTaskPlan.includes("Topic: Module context"), "project-level preset should render declared project preset templates");
const projectFlagSource = path.join(tmpRoot, "project-flag-preset");
fs.mkdirSync(path.join(projectFlagSource, "templates"), { recursive: true });
fs.writeFileSync(path.join(projectFlagSource, "preset.yaml"), `id: project-flag
version: 1
purpose: Project-level flag preset
compatibleBudgets: [standard]
localeSupport: [en-US]
task:
  kind: project-flag-task
  defaultTaskId: project-flag-task
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
inputs:
  quick:
    type: flag
    flag: --quick
    required: false
templateValues:
  quick:
    from: inputs.quick
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
fs.writeFileSync(path.join(projectFlagSource, "templates/task_plan.append.md"), "## Project Flag\n\nQuick: {{quick}}\n");
expectJson(["preset", "install", projectFlagSource, "--project", "--force", "--json", target], { env });
const projectFlagCreated = expectJson(["new-task", "project-flag-task", "--budget", "standard", "--preset", "project-flag", "--quick", target], { env });
assert(projectFlagCreated.task.kind === "project-flag-task", "new-task should resolve project-level presets when the preset input is a boolean flag");
const projectFlagTaskPlan = fs.readFileSync(path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-project-flag-task/task_plan.md`), "utf8");
assert(projectFlagTaskPlan.includes("Quick: true"), "project-level boolean flag preset input should render without consuming the target path");
const missingInput = run(["new-task", "custom-review-task", "--budget", "standard", "--preset", "custom-review", target], { env });
assert(missingInput.status !== 0, "new-task should fail when required preset input is missing");
assert(`${missingInput.stdout}\n${missingInput.stderr}`.includes("--subject"), `missing preset input error should name the CLI flag\nSTDOUT:\n${missingInput.stdout}\nSTDERR:\n${missingInput.stderr}`);
const created = expectJson(["new-task", "custom-review-task", "--budget", "standard", "--preset", "custom-review", "--subject", "API contracts", target], { env });
assert(created.task.kind === "review-task", "custom preset should set task kind from manifest");
assert(created.task.preset === "custom-review", "custom preset should report preset id");
assert(created.task.evidenceBundle, "custom preset should report evidence bundle");
const customTaskDir = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-custom-review-task`);
const customTaskPlan = fs.readFileSync(path.join(customTaskDir, "task_plan.md"), "utf8");
assert(customTaskPlan.includes("Task Preset: custom-review"), "generic preset engine should persist preset metadata");
assert(customTaskPlan.includes("Task Kind: review-task"), "generic preset engine should persist manifest task kind");
assert(customTaskPlan.includes("Review Subject: API contracts"), "generic preset engine should render declarative metadata");
assert(customTaskPlan.includes("Subject: API contracts"), "generic preset engine should render declarative template values");
assert(fs.readFileSync(path.join(target, created.task.evidenceBundle, "subject.txt"), "utf8").trim() === "API contracts", "generic preset engine should generate declared text evidence");
assert(fs.existsSync(path.join(target, created.task.evidenceBundle, "preset-audit.json")), "generic preset engine should generate declared audit evidence");
assert(fs.existsSync(path.join(target, created.task.evidenceBundle, "preset-manifest.json")), "generic preset engine should generate declared manifest evidence");
assert(fs.existsSync(path.join(target, created.task.evidenceBundle, "write-scope.json")), "generic preset engine should generate declared write-scope evidence");
const customPresetManifest = JSON.parse(fs.readFileSync(path.join(target, created.task.evidenceBundle, "preset-manifest.json"), "utf8"));
assert(customPresetManifest.metadata.ReviewSubject.from === "inputs.subject", "preset manifest evidence should include declarative metadata");
const customStatus = expectJson(["status", "--json", target], { env });
assert(customStatus.checkState.status === "pass", `target status should accept installed custom presets\n${JSON.stringify(customStatus.checkState, null, 2)}`);
const customStatusTask = customStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-custom-review-task`);
assert(customStatusTask?.taskPreset === "custom-review", "status should expose installed custom preset id");
assert(customStatusTask?.taskKind === "review-task", "status should expose installed custom preset kind");
assert(customStatusTask?.presetVersion === "1", "status should expose installed custom preset version");
assert(customStatusTask?.evidenceBundle === `TARGET:${created.task.evidenceBundle}`, "status should expose installed custom preset evidence bundle");
const customTaskIndex = expectJson(["task-index", "--json", target], { env });
const customIndexedTask = customTaskIndex.tasks.find((task) => task.id === `TASKS/${todayLocal}-custom-review-task`);
assert(customIndexedTask?.preset === "custom-review", "task-index should expose installed custom preset id");
assert(customIndexedTask?.kind === "review-task", "task-index should expose installed custom preset task kind");
assert(customIndexedTask?.evidenceBundle === `TARGET:${created.task.evidenceBundle}`, "task-index should expose installed custom preset evidence bundle");
const contextSource = path.join(tmpRoot, "context-bundle-preset");
fs.mkdirSync(path.join(contextSource, "templates/references"), { recursive: true });
fs.mkdirSync(path.join(contextSource, "resources/artifacts"), { recursive: true });
fs.writeFileSync(path.join(contextSource, "preset.yaml"), `id: context-bundle
version: 1
purpose: Create tasks with shared upstream service references
compatibleBudgets: [complex]
localeSupport: [en-US]
task:
  kind: service-integration
  defaultTaskId: service-integration-task
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
inputs:
  service:
    type: text
    flag: --service
    required: true
templateValues:
  service:
    from: inputs.service
metadata:
  UpstreamService:
    label: Upstream Service
    from: inputs.service
resources:
  references:
    upstreamContract:
      path: references/upstream-contract.md
      template: templates/references/upstream-contract.md
      index:
        id: REF-001
        type: code
        summary: Shared upstream {{service}} contract for every task created by this preset.
        usedBy: coordinator,worker,reviewer
    serviceRunbook:
      path: references/service-runbook.md
      source: resources/service-runbook.md
      index:
        id: REF-002
        type: runbook
        summary: Local verification notes for the shared upstream service.
        usedBy: worker
  artifacts:
    inputPacket:
      path: artifacts/input-packet.md
      source: resources/artifacts/input-packet.md
      index:
        id: ART-001
        type: fixture
        summary: Shared fixture packet | copied by the preset.
        producedBy: preset
context:
  requiredReads: [REF-001, REF-002]
evidence:
  bundleDir: artifacts/preset
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json, preset-manifest.json, write-scope.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
fs.writeFileSync(path.join(contextSource, "templates/references/upstream-contract.md"), "# {{service}} Contract\n\nShared contract for {{service}}.\n");
fs.writeFileSync(path.join(contextSource, "resources/service-runbook.md"), "# Service Runbook\n\nStart the shared service before running integration checks.\n");
fs.writeFileSync(path.join(contextSource, "resources/artifacts/input-packet.md"), "# Input Packet\n\nFixture shared by all preset-created tasks.\n");
const contextCheck = expectJson(["preset", "check", contextSource, "--json"], { env });
assert(contextCheck.resources.references.upstreamContract.index.id === "REF-001", "preset check should expose declared reference resources");
assert(contextCheck.context.requiredReads.includes("REF-001"), "preset check should expose required reads");
expectJson(["preset", "install", contextSource, "--force", "--json"], { env });
const firstContextTask = expectJson(["new-task", "payment-api", "--budget", "complex", "--preset", "context-bundle", "--service", "payment-service", "--title", "Payment API integration", target], { env });
const secondContextTask = expectJson(["new-task", "refund-api", "--budget", "complex", "--preset", "context-bundle", "--service", "payment-service", "--title", "Refund API integration", target], { env });
for (const taskName of ["payment-api", "refund-api"]) {
    const taskDir = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-${taskName}`);
    const taskPlan = fs.readFileSync(path.join(taskDir, "task_plan.md"), "utf8");
    assert(taskPlan.includes("Upstream Service: payment-service"), `${taskName} should persist preset metadata`);
    assert(taskPlan.includes("## Preset Required Reads"), `${taskName} should tell agents to read preset-provided references`);
    assert(taskPlan.includes("| Reference | Path | Why |"), `${taskName} should include concrete paths in required reads`);
    assert(taskPlan.includes("REF-001") && taskPlan.includes("references/upstream-contract.md"), `${taskName} should include declared required reads and paths`);
    assert(fs.readFileSync(path.join(taskDir, "references/upstream-contract.md"), "utf8").includes("payment-service Contract"), `${taskName} should render templated shared reference`);
    assert(fs.existsSync(path.join(taskDir, "references/service-runbook.md")), `${taskName} should copy source shared reference`);
    assert(fs.existsSync(path.join(taskDir, "artifacts/input-packet.md")), `${taskName} should copy source shared artifact`);
    const referenceIndex = fs.readFileSync(path.join(taskDir, "references/INDEX.md"), "utf8");
    assert(referenceIndex.includes("| ID | Type | Path | Summary | Used By |"), `${taskName} should keep reference index table schema aligned`);
    assert(referenceIndex.includes("REF-001") && referenceIndex.includes("Shared upstream payment-service contract"), `${taskName} should index rendered shared references`);
    const artifactIndex = fs.readFileSync(path.join(taskDir, "artifacts/INDEX.md"), "utf8");
    assert(artifactIndex.includes("| ID | Type | Path | Summary | Produced By |"), `${taskName} should keep artifact index table schema aligned`);
    assert(artifactIndex.includes("ART-001") && artifactIndex.includes("Shared fixture packet &#124; copied by the preset."), `${taskName} should index shared artifacts and escape Markdown table cells`);
}
const pipeContextTask = expectJson(["new-task", "pipe-api", "--budget", "complex", "--preset", "context-bundle", "--service", "payment | service", "--title", "Pipe API integration", target], { env });
const pipeTaskDir = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-pipe-api`);
const pipeReferenceIndex = fs.readFileSync(path.join(pipeTaskDir, "references/INDEX.md"), "utf8");
const pipeTaskPlan = fs.readFileSync(path.join(pipeTaskDir, "task_plan.md"), "utf8");
assert(pipeReferenceIndex.includes("payment &#124; service"), "resource index rows should escape CLI-derived pipe characters");
assert(pipeTaskPlan.includes("payment &#124; service"), "required-read rows should escape CLI-derived pipe characters");
const contextStatus = expectJson(["status", "--json", target], { env });
assert(contextStatus.checkState.status === "pass", `target status should accept preset-provided shared references\n${JSON.stringify(contextStatus.checkState, null, 2)}`);
const contextTaskIndex = expectJson(["task-index", "--json", target], { env });
assert(contextTaskIndex.tasks.some((task) => task.id === `TASKS/${todayLocal}-payment-api` && task.preset === "context-bundle"), "task-index should include first context preset task");
assert(contextTaskIndex.tasks.some((task) => task.id === `TASKS/${todayLocal}-refund-api` && task.preset === "context-bundle"), "task-index should include second context preset task");
assert(contextTaskIndex.tasks.some((task) => task.id === `TASKS/${todayLocal}-pipe-api` && task.preset === "context-bundle"), "task-index should include pipe context preset task");
assert(firstContextTask.task.evidenceBundle !== secondContextTask.task.evidenceBundle, "each preset-created task should retain an independent audit/evidence bundle");
assert(pipeContextTask.task.evidenceBundle !== firstContextTask.task.evidenceBundle, "pipe context task should retain an independent audit/evidence bundle");
const generatedReferencePath = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-payment-api/references/upstream-contract.md`);
const generatedReferenceContent = fs.readFileSync(generatedReferencePath, "utf8");
fs.unlinkSync(generatedReferencePath);
const missingGeneratedReference = run(["check", "--profile", "target-project", target], { env });
assert(missingGeneratedReference.status !== 0, "target check should fail when a preset-declared reference file is missing");
assert(`${missingGeneratedReference.stdout}\n${missingGeneratedReference.stderr}`.includes("context-bundle preset resource missing"), "missing preset resource failure should name the preset contract");
fs.writeFileSync(generatedReferencePath, generatedReferenceContent);
const generatedReferenceIndexPath = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-payment-api/references/INDEX.md`);
const generatedReferenceIndexContent = fs.readFileSync(generatedReferenceIndexPath, "utf8");
fs.writeFileSync(generatedReferenceIndexPath, generatedReferenceIndexContent.split(/\r?\n/).filter((line) => !line.includes("| REF-001 |")).join("\n"));
const missingGeneratedReferenceIndex = run(["check", "--profile", "target-project", target], { env });
assert(missingGeneratedReferenceIndex.status !== 0, "target check should fail when a preset-declared reference index row is missing");
assert(`${missingGeneratedReferenceIndex.stdout}\n${missingGeneratedReferenceIndex.stderr}`.includes("context-bundle preset reference index missing REF-001"), "missing preset reference index failure should name the resource id");
fs.writeFileSync(generatedReferenceIndexPath, generatedReferenceIndexContent);
const generatedArtifactIndexPath = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-payment-api/artifacts/INDEX.md`);
const generatedArtifactIndexContent = fs.readFileSync(generatedArtifactIndexPath, "utf8");
fs.writeFileSync(generatedArtifactIndexPath, generatedArtifactIndexContent.split(/\r?\n/).filter((line) => !line.includes("| ART-001 |")).join("\n"));
const missingGeneratedArtifactIndex = run(["check", "--profile", "target-project", target], { env });
assert(missingGeneratedArtifactIndex.status !== 0, "target check should fail when a preset-declared artifact index row is missing");
assert(`${missingGeneratedArtifactIndex.stdout}\n${missingGeneratedArtifactIndex.stderr}`.includes("context-bundle preset artifact index missing ART-001"), "missing preset artifact index failure should name the resource id");
fs.writeFileSync(generatedArtifactIndexPath, generatedArtifactIndexContent);
const generatedTaskPlanPath = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-payment-api/task_plan.md`);
const generatedTaskPlanContent = fs.readFileSync(generatedTaskPlanPath, "utf8");
fs.writeFileSync(generatedTaskPlanPath, generatedTaskPlanContent.replace(/\| REF-001 \| TARGET:[^|]+ \| [^|\n]+ \|/, "| REF-001 | references/INDEX.md | Mentioned without the concrete reference path |"));
const missingRequiredReadPath = run(["check", "--profile", "target-project", target], { env });
assert(missingRequiredReadPath.status !== 0, "target check should fail when a preset required-read row loses its concrete path");
assert(`${missingRequiredReadPath.stdout}\n${missingRequiredReadPath.stderr}`.includes("context-bundle preset required read missing from task plan: REF-001"), "missing required-read path failure should name the resource id");
fs.writeFileSync(generatedTaskPlanPath, generatedTaskPlanContent);
const contextShadowSource = path.join(tmpRoot, "context-bundle-shadow-preset");
fs.mkdirSync(contextShadowSource, { recursive: true });
fs.writeFileSync(path.join(contextShadowSource, "preset.yaml"), `id: context-bundle
version: 1
purpose: Shadowed context bundle without the original resources
compatibleBudgets: [complex]
task:
  kind: service-integration
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
expectJson(["preset", "install", contextShadowSource, "--force", "--json"], { env });
const shadowedPresetCheck = run(["check", "--profile", "target-project", target], { env });
assert(shadowedPresetCheck.status !== 0, "target check should fail when the currently discovered preset manifest no longer matches the task audit");
assert(`${shadowedPresetCheck.stdout}\n${shadowedPresetCheck.stderr}`.includes("preset manifest hash mismatch"), "manifest mismatch failure should name the preset audit hash drift");
expectJson(["preset", "install", contextSource, "--force", "--json"], { env });
expectPass(["check", "--profile", "target-project", target], { env });
const currentTarget = path.join(tmpRoot, "preset-engine-current-target");
fs.mkdirSync(currentTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", currentTarget], { env });
const createdInCurrent = expectJson(["new-task", "current-review-task", "--budget", "standard", "--preset", "custom-review", "--subject", "Current directory target"], { env, cwd: currentTarget });
assert(createdInCurrent.task.id === `TASKS/${todayLocal}-current-review-task`, "custom preset inputs without an explicit target should use the current directory");
const currentTaskPlan = fs.readFileSync(path.join(currentTarget, `coding-agent-harness/planning/tasks/${todayLocal}-current-review-task/task_plan.md`), "utf8");
assert(currentTaskPlan.includes("Subject: Current directory target"), "custom preset input values should not be mistaken for target paths");
const badIdSource = path.join(tmpRoot, "bad-id-preset");
fs.mkdirSync(badIdSource, { recursive: true });
fs.writeFileSync(path.join(badIdSource, "preset.yaml"), `id: ../../Documents
version: 1
purpose: Bad id preset
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const badIdInstall = run(["preset", "install", badIdSource, "--force", "--json"], { env });
assert(badIdInstall.status !== 0, "preset install should reject ids that are not safe directory names");
assert(`${badIdInstall.stdout}\n${badIdInstall.stderr}`.includes("Invalid preset id"), "bad preset id rejection should explain the invalid id");
const badIdUninstall = run(["preset", "uninstall", "../../Documents", "--json"], { env });
assert(badIdUninstall.status !== 0, "preset uninstall should reject path traversal ids");
assert(`${badIdUninstall.stdout}\n${badIdUninstall.stderr}`.includes("Invalid preset id"), "bad uninstall id rejection should explain the invalid id");
const invalidOverwriteSource = path.join(tmpRoot, "custom-review-invalid-overwrite");
fs.mkdirSync(invalidOverwriteSource, { recursive: true });
fs.writeFileSync(path.join(invalidOverwriteSource, "preset.yaml"), `id: custom-review
version: 1
purpose: Invalid overwrite fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
    templates:
      taskPlanAppend: templates/missing.md
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const invalidOverwrite = run(["preset", "install", invalidOverwriteSource, "--force", "--json"], { env });
assert(invalidOverwrite.status !== 0, "failed forced overwrite should exit non-zero");
assert(expectJson(["preset", "check", "custom-review", "--json"], { env }).status === "pass", "failed forced overwrite should preserve the previous installed preset");
const badAuditEvidenceSource = path.join(tmpRoot, "bad-audit-evidence-preset");
fs.mkdirSync(badAuditEvidenceSource, { recursive: true });
fs.writeFileSync(path.join(badAuditEvidenceSource, "preset.yaml"), `id: bad-audit-evidence
version: 1
purpose: Bad audit evidence fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
audit:
  manifestRequired: true
  evidenceFiles: [../../victim-review.md]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const badAuditEvidenceCheck = run(["preset", "check", badAuditEvidenceSource, "--json"], { env });
assert(badAuditEvidenceCheck.status !== 0, "preset check should reject audit evidence paths that escape the evidence bundle");
assert(`${badAuditEvidenceCheck.stdout}\n${badAuditEvidenceCheck.stderr}`.includes("audit evidence file must be a basename"), "bad audit evidence path rejection should explain the basename requirement");
const blockedSource = path.join(tmpRoot, "bad-scope-preset");
fs.mkdirSync(path.join(blockedSource, "templates"), { recursive: true });
fs.writeFileSync(path.join(blockedSource, "preset.yaml"), `id: bad-scope
version: 1
purpose: Bad write scope preset
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
inputs:
  note:
    type: text
    flag: --note
    required: false
    default: ok
evidence:
  bundleDir: ../../outside
  files:
    note:
      path: note.txt
      type: text
      value: inputs.note
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const badScopeCheck = run(["preset", "check", blockedSource, "--json"], { env });
assert(badScopeCheck.status !== 0, "preset check should reject evidence bundles that escape the task directory");
assert(`${badScopeCheck.stdout}\n${badScopeCheck.stderr}`.includes("evidence.bundleDir escapes task directory"), "bad preset check should explain the escaping evidence bundle");
const badScopeInstall = run(["preset", "install", blockedSource, "--force", "--json"], { env });
assert(badScopeInstall.status !== 0, "preset install should reject write-scope-violating manifests before task creation");
const badEvidenceFilesSource = path.join(tmpRoot, "bad-evidence-files-preset");
fs.mkdirSync(badEvidenceFilesSource, { recursive: true });
fs.writeFileSync(path.join(badEvidenceFilesSource, "preset.yaml"), `id: bad-evidence-files
version: 1
purpose: Bad evidence files fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
evidence:
  bundleDir: artifacts/preset
  files: [summary.json]
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const badEvidenceFilesCheck = run(["preset", "check", badEvidenceFilesSource, "--json"], { env });
assert(badEvidenceFilesCheck.status !== 0, "preset check should reject evidence.files arrays");
assert(`${badEvidenceFilesCheck.stdout}\n${badEvidenceFilesCheck.stderr}`.includes("evidence file 0 must be a mapping"), "bad evidence.files rejection should explain the mapping requirement");
const badResourceSource = path.join(tmpRoot, "bad-resource-preset");
fs.mkdirSync(badResourceSource, { recursive: true });
fs.writeFileSync(path.join(badResourceSource, "preset.yaml"), `id: bad-resource
version: 1
purpose: Bad resource fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    escaped:
      path: ../../outside.md
      source: resources/missing.md
      index:
        id: REF-001
        type: code
        summary: Bad escaped path.
        usedBy: worker
context:
  requiredReads: [REF-999]
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const badResourceCheck = run(["preset", "check", badResourceSource, "--json"], { env });
assert(badResourceCheck.status !== 0, "preset check should reject invalid resource bundle declarations");
const badResourceOutput = `${badResourceCheck.stdout}\n${badResourceCheck.stderr}`;
assert(badResourceOutput.includes("resource escaped path escapes task directory"), "bad resource path should be reported");
assert(badResourceOutput.includes("required read REF-999 does not match a declared reference"), "bad required read should be reported");
const symlinkResourceSource = path.join(tmpRoot, "symlink-resource-preset");
const symlinkOutside = path.join(tmpRoot, "outside-resource.md");
fs.mkdirSync(path.join(symlinkResourceSource, "resources"), { recursive: true });
fs.writeFileSync(symlinkOutside, "# Outside Resource\n");
fs.symlinkSync(symlinkOutside, path.join(symlinkResourceSource, "resources/secret.md"));
fs.writeFileSync(path.join(symlinkResourceSource, "preset.yaml"), `id: symlink-resource
version: 1
purpose: Symlink resource fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    secret:
      path: references/secret.md
      source: resources/secret.md
      index:
        id: REF-001
        type: code
        summary: This source must not follow a symlink.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const symlinkResourceCheck = run(["preset", "check", symlinkResourceSource, "--json"], { env });
assert(symlinkResourceCheck.status !== 0, "preset check should reject symlinked preset resource sources");
assert(`${symlinkResourceCheck.stdout}\n${symlinkResourceCheck.stderr}`.includes("must not be a symlink"), "symlink resource rejection should explain that symlinks are not accepted");
const symlinkManifestSource = path.join(tmpRoot, "symlink-manifest-preset");
const symlinkManifestOutside = path.join(tmpRoot, "outside-manifest.yaml");
fs.mkdirSync(symlinkManifestSource, { recursive: true });
fs.writeFileSync(symlinkManifestOutside, `id: symlink-manifest
version: 1
purpose: Symlink manifest fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
fs.symlinkSync(symlinkManifestOutside, path.join(symlinkManifestSource, "preset.yaml"));
const symlinkLocalManifestCheck = run(["preset", "check", symlinkManifestSource, "--json"], { env });
assert(symlinkLocalManifestCheck.status !== 0, "preset check should reject local preset packages whose manifest is a symlink");
assert(`${symlinkLocalManifestCheck.stdout}\n${symlinkLocalManifestCheck.stderr}`.includes("Preset manifest must not be a symlink"), "local symlink manifest rejection should explain the manifest boundary");
const projectSymlinkManifestDir = path.join(target, ".coding-agent-harness/presets/symlink-manifest");
fs.mkdirSync(projectSymlinkManifestDir, { recursive: true });
fs.symlinkSync(symlinkManifestOutside, path.join(projectSymlinkManifestDir, "preset.yaml"));
const symlinkProjectManifestCheck = run(["preset", "check", "symlink-manifest", "--json", target], { env });
assert(symlinkProjectManifestCheck.status !== 0, "preset check should reject discovered project presets whose manifest is a symlink");
assert(`${symlinkProjectManifestCheck.stdout}\n${symlinkProjectManifestCheck.stderr}`.includes("Preset manifest must not be a symlink"), "project symlink manifest rejection should explain the manifest boundary");
const symlinkDirectoryOutside = path.join(tmpRoot, "outside-preset-directory");
fs.mkdirSync(symlinkDirectoryOutside, { recursive: true });
fs.writeFileSync(path.join(symlinkDirectoryOutside, "preset.yaml"), `id: dir-link
version: 1
purpose: Symlink package directory fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const symlinkLocalDirectory = path.join(tmpRoot, "local-dir-link-preset");
fs.symlinkSync(symlinkDirectoryOutside, symlinkLocalDirectory);
const symlinkLocalDirectoryCheck = run(["preset", "check", symlinkLocalDirectory, "--json"], { env });
assert(symlinkLocalDirectoryCheck.status !== 0, "preset check should reject local preset package directories that are symlinks");
assert(`${symlinkLocalDirectoryCheck.stdout}\n${symlinkLocalDirectoryCheck.stderr}`.includes("Preset package directory must not be a symlink"), "local symlink directory rejection should explain the package boundary");
fs.symlinkSync(symlinkDirectoryOutside, path.join(target, ".coding-agent-harness/presets/dir-link"));
const symlinkProjectDirectoryCheck = run(["preset", "check", "dir-link", "--json", target], { env });
assert(symlinkProjectDirectoryCheck.status !== 0, "preset check should reject discovered project preset package directories that are symlinks");
assert(`${symlinkProjectDirectoryCheck.stdout}\n${symlinkProjectDirectoryCheck.stderr}`.includes("Preset package directory must not be a symlink"), "project symlink directory rejection should explain the package boundary");
const overwriteResourceSource = path.join(tmpRoot, "overwrite-resource-preset");
fs.mkdirSync(path.join(overwriteResourceSource, "resources"), { recursive: true });
fs.writeFileSync(path.join(overwriteResourceSource, "resources/task-plan.md"), "# overwritten\n");
fs.writeFileSync(path.join(overwriteResourceSource, "preset.yaml"), `id: overwrite-resource
version: 1
purpose: Overwrite resource fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    overwrite:
      path: task_plan.md
      source: resources/task-plan.md
      index:
        id: REF-001
        type: code
        summary: This should not overwrite task plan.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const overwriteResourceCheck = run(["preset", "check", overwriteResourceSource, "--json"], { env });
assert(overwriteResourceCheck.status !== 0, "preset check should reject resource destinations that can overwrite task contracts");
assert(`${overwriteResourceCheck.stdout}\n${overwriteResourceCheck.stderr}`.includes("reference resource overwrite path must be under references/"), "overwrite resource rejection should explain the allowed reference directory");
const duplicateResourceSource = path.join(tmpRoot, "duplicate-resource-preset");
fs.mkdirSync(path.join(duplicateResourceSource, "resources"), { recursive: true });
fs.writeFileSync(path.join(duplicateResourceSource, "resources/a.md"), "A\n");
fs.writeFileSync(path.join(duplicateResourceSource, "resources/b.md"), "B\n");
fs.writeFileSync(path.join(duplicateResourceSource, "preset.yaml"), `id: duplicate-resource
version: 1
purpose: Duplicate resource fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    first:
      path: references/first.md
      source: resources/a.md
      index:
        id: REF-001
        type: code
        summary: First reference.
        usedBy: worker
    second:
      path: references/second.md
      source: resources/b.md
      index:
        id: REF-001
        type: code
        summary: Second reference.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const duplicateResourceCheck = run(["preset", "check", duplicateResourceSource, "--json"], { env });
assert(duplicateResourceCheck.status !== 0, "preset check should reject duplicate reference IDs");
assert(`${duplicateResourceCheck.stdout}\n${duplicateResourceCheck.stderr}`.includes("duplicate reference resource id: REF-001"), "duplicate resource ID rejection should explain the conflict");
const duplicatePathSource = path.join(tmpRoot, "duplicate-resource-path-preset");
fs.mkdirSync(path.join(duplicatePathSource, "resources"), { recursive: true });
fs.writeFileSync(path.join(duplicatePathSource, "resources/a.md"), "A\n");
fs.writeFileSync(path.join(duplicatePathSource, "resources/b.md"), "B\n");
fs.writeFileSync(path.join(duplicatePathSource, "preset.yaml"), `id: duplicate-resource-path
version: 1
purpose: Duplicate resource path fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    first:
      path: references/shared.md
      source: resources/a.md
      index:
        id: REF-001
        type: code
        summary: First reference.
        usedBy: worker
    second:
      path: references/shared.md
      source: resources/b.md
      index:
        id: REF-002
        type: code
        summary: Second reference.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const duplicatePathCheck = run(["preset", "check", duplicatePathSource, "--json"], { env });
assert(duplicatePathCheck.status !== 0, "preset check should reject duplicate resource destination paths");
assert(`${duplicatePathCheck.stdout}\n${duplicatePathCheck.stderr}`.includes("duplicate resource path: references/shared.md"), "duplicate resource path rejection should explain the conflict");
const directoryPathResourceSource = path.join(tmpRoot, "directory-path-resource-preset");
fs.mkdirSync(path.join(directoryPathResourceSource, "resources"), { recursive: true });
fs.writeFileSync(path.join(directoryPathResourceSource, "resources/reference.md"), "Reference\n");
fs.writeFileSync(path.join(directoryPathResourceSource, "preset.yaml"), `id: directory-path-resource
version: 1
purpose: Directory path resource fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    directoryPath:
      path: references/
      source: resources/reference.md
      index:
        id: REF-001
        type: code
        summary: This should not be a directory.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const directoryPathResourceCheck = run(["preset", "check", directoryPathResourceSource, "--json"], { env });
assert(directoryPathResourceCheck.status !== 0, "preset check should reject directory-like resource destinations");
assert(`${directoryPathResourceCheck.stdout}\n${directoryPathResourceCheck.stderr}`.includes("reference resource directoryPath path must be a file under references/"), "directory-like path rejection should explain the file requirement");
const directorySourceResourceSource = path.join(tmpRoot, "directory-source-resource-preset");
fs.mkdirSync(path.join(directorySourceResourceSource, "resources"), { recursive: true });
fs.writeFileSync(path.join(directorySourceResourceSource, "preset.yaml"), `id: directory-source-resource
version: 1
purpose: Directory source resource fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    directorySource:
      path: references/source.md
      source: resources
      index:
        id: REF-001
        type: code
        summary: This source points at a directory.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const directorySourceResourceCheck = run(["preset", "check", directorySourceResourceSource, "--json"], { env });
assert(directorySourceResourceCheck.status !== 0, "preset check should reject directory source resources");
assert(`${directorySourceResourceCheck.stdout}\n${directorySourceResourceCheck.stderr}`.includes("reference resource directorySource source must be a file"), "directory source rejection should explain the file requirement");
const directoryTemplateResourceSource = path.join(tmpRoot, "directory-template-resource-preset");
fs.mkdirSync(path.join(directoryTemplateResourceSource, "templates/references"), { recursive: true });
fs.writeFileSync(path.join(directoryTemplateResourceSource, "preset.yaml"), `id: directory-template-resource
version: 1
purpose: Directory template resource fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    directoryTemplate:
      path: references/template.md
      template: templates/references
      index:
        id: REF-001
        type: code
        summary: This template points at a directory.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const directoryTemplateResourceCheck = run(["preset", "check", directoryTemplateResourceSource, "--json"], { env });
assert(directoryTemplateResourceCheck.status !== 0, "preset check should reject directory template resources");
assert(`${directoryTemplateResourceCheck.stdout}\n${directoryTemplateResourceCheck.stderr}`.includes("reference resource directoryTemplate template must be a file"), "directory template rejection should explain the file requirement");
const pipeResourcePathSource = path.join(tmpRoot, "pipe-resource-path-preset");
fs.mkdirSync(path.join(pipeResourcePathSource, "resources"), { recursive: true });
fs.writeFileSync(path.join(pipeResourcePathSource, "resources/reference.md"), "Reference\n");
fs.writeFileSync(path.join(pipeResourcePathSource, "preset.yaml"), `id: pipe-resource-path
version: 1
purpose: Pipe resource path fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    pipePath:
      path: references/foo|bar.md
      source: resources/reference.md
      index:
        id: REF-001
        type: code
        summary: This path contains a table delimiter.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const pipeResourcePathCheck = run(["preset", "check", pipeResourcePathSource, "--json"], { env });
assert(pipeResourcePathCheck.status !== 0, "preset check should reject resource paths containing Markdown table delimiters");
assert(`${pipeResourcePathCheck.stdout}\n${pipeResourcePathCheck.stderr}`.includes("reference resource pipePath path cannot contain Markdown table delimiters"), "pipe path rejection should explain the delimiter issue");
const pipeResourceIdSource = path.join(tmpRoot, "pipe-resource-id-preset");
fs.mkdirSync(path.join(pipeResourceIdSource, "resources"), { recursive: true });
fs.writeFileSync(path.join(pipeResourceIdSource, "resources/reference.md"), "Reference\n");
fs.writeFileSync(path.join(pipeResourceIdSource, "preset.yaml"), `id: pipe-resource-id
version: 1
purpose: Pipe resource id fixture
compatibleBudgets: [complex]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
resources:
  references:
    pipeId:
      path: references/reference.md
      source: resources/reference.md
      index:
        id: REF|001
        type: code
        summary: This id contains a table delimiter.
        usedBy: worker
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const pipeResourceIdCheck = run(["preset", "check", pipeResourceIdSource, "--json"], { env });
assert(pipeResourceIdCheck.status !== 0, "preset check should reject resource IDs containing Markdown table delimiters");
assert(`${pipeResourceIdCheck.stdout}\n${pipeResourceIdCheck.stderr}`.includes("reference resource pipeId index.id cannot contain Markdown table delimiters"), "pipe id rejection should explain the delimiter issue");
const referenceIndexTemplate = fs.readFileSync(path.join(repoRootFromTest(), "templates/planning/optional/references/INDEX.md"), "utf8");
const artifactIndexTemplate = fs.readFileSync(path.join(repoRootFromTest(), "templates/planning/optional/artifacts/INDEX.md"), "utf8");
assert(!referenceIndexTemplate.includes("| REF-001 |"), "reference index template should not ship a real-looking placeholder resource id");
assert(!artifactIndexTemplate.includes("| ART-001 |"), "artifact index template should not ship a real-looking placeholder artifact id");
const exactScopeSource = path.join(tmpRoot, "exact-scope-preset");
fs.mkdirSync(exactScopeSource, { recursive: true });
fs.writeFileSync(path.join(exactScopeSource, "preset.yaml"), `id: exact-scope
version: 1
purpose: Exact scope fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks]
    audit: true
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks
    access: write
`);
expectJson(["preset", "install", exactScopeSource, "--force", "--json"], { env });
const exactScopeCreate = run(["new-task", "exact-scope-task", "--preset", "exact-scope", target], { env });
assert(exactScopeCreate.status !== 0, "runtime write scope enforcement should cover generated task files, not only evidence");
assert(`${exactScopeCreate.stdout}\n${exactScopeCreate.stderr}`.includes("write scope"), "runtime scope failure should explain the write scope violation");
const rootDocTemplateSource = path.join(tmpRoot, "root-doc-template-preset");
fs.mkdirSync(path.join(rootDocTemplateSource, "templates"), { recursive: true });
fs.writeFileSync(path.join(rootDocTemplateSource, "templates/INDEX.md"), "# Custom root index\n");
fs.writeFileSync(path.join(rootDocTemplateSource, "preset.yaml"), `id: root-doc-template
version: 1
purpose: Invalid root scaffold template fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
    templates:
      index: templates/INDEX.md
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const rootDocTemplateCheck = run(["preset", "check", rootDocTemplateSource, "--json"], { env });
assert(rootDocTemplateCheck.status !== 0, "preset check should reject custom root-level base scaffold templates");
assert(`${rootDocTemplateCheck.stdout}\n${rootDocTemplateCheck.stderr}`.includes("unsupported newTask template"), "root template rejection should explain unsupported base scaffold template keys");
const rootResourcePathSource = path.join(tmpRoot, "root-resource-path-preset");
fs.mkdirSync(rootResourcePathSource, { recursive: true });
fs.writeFileSync(path.join(rootResourcePathSource, "preset.yaml"), `id: root-resource-path
version: 1
purpose: Invalid root resource path fixture
compatibleBudgets: [complex]
resources:
  references:
    rootIndex:
      source: preset.yaml
      path: INDEX.md
      index:
        id: REF-ROOT
        summary: Root resource paths must be rejected.
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const rootResourcePathCheck = run(["preset", "check", rootResourcePathSource, "--json"], { env });
assert(rootResourcePathCheck.status !== 0, "preset check should reject root-level resource paths");
assert(`${rootResourcePathCheck.stdout}\n${rootResourcePathCheck.stderr}`.includes("must be under references/"), "root resource rejection should preserve isolated reference/artifact directories");
const rootArtifactPathSource = path.join(tmpRoot, "root-artifact-path-preset");
fs.mkdirSync(rootArtifactPathSource, { recursive: true });
fs.writeFileSync(path.join(rootArtifactPathSource, "preset.yaml"), `id: root-artifact-path
version: 1
purpose: Invalid root artifact path fixture
compatibleBudgets: [complex]
resources:
  artifacts:
    rootIndex:
      source: preset.yaml
      path: INDEX.md
      index:
        id: ART-ROOT
        summary: Root artifact paths must be rejected.
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`);
const rootArtifactPathCheck = run(["preset", "check", rootArtifactPathSource, "--json"], { env });
assert(rootArtifactPathCheck.status !== 0, "preset check should reject root-level artifact resource paths");
assert(`${rootArtifactPathCheck.stdout}\n${rootArtifactPathCheck.stderr}`.includes("must be under artifacts/"), "root artifact rejection should preserve isolated artifact directory");
const builtinInstall = expectJson(["preset", "install", "legacy-migration", "--force", "--json"], { env });
assert(builtinInstall.installed === true && builtinInstall.id === "legacy-migration", "preset install should copy builtin presets by id");
assert(expectJson(["preset", "inspect", "legacy-migration", "--json"], { env }).source === "user", "installed builtin preset should be discovered from user directory first");
const uninstall = expectJson(["preset", "uninstall", "custom-review", "--json"], { env });
assert(uninstall.removed === true, "preset uninstall should remove user-installed presets");
expectPass(["preset", "check", "standard-task"], { env });
const standardTask = expectJson(["new-task", "standard-task-fixture", "--preset", "standard-task", "--title", "Standard Task Fixture", target], { env });
assert(standardTask.task.preset === "standard-task", "second builtin preset should work through the generic engine");
assert(fs.existsSync(path.join(target, standardTask.task.evidenceBundle, "preset-audit.json")), "second builtin preset should generate audit evidence");
const standardTaskPlan = fs.readFileSync(path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-standard-task-fixture/task_plan.md`), "utf8");
assert(standardTaskPlan.includes("Preset Title | Standard Task Fixture"), "second builtin preset should render the global task title through task.title");
console.log("Preset engine tests passed");
function repoRootFromTest() {
    return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}
