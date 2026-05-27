// @ts-nocheck
// Module-parallel private harness checks stay behavior-first until legacy module context types are modeled.
import fs from "node:fs";
import path from "node:path";
import { walkFiles } from "./core-shared.mjs";
import { legacyLedgerFile, legacyModuleRoot, legacyPath, legacyPlanningRoot, } from "./harness-paths.mjs";
const moduleRegistryPath = legacyPath(legacyPlanningRoot, "Module-Registry.md");
const legacyModulesPath = legacyPath(legacyModuleRoot);
const legacyLedgerPath = legacyPath(legacyLedgerFile);
function stripMarkdownCode(value) {
    return String(value || "").replace(/`/g, "").trim();
}
function modulePromptBlock(content, key) {
    const heading = `## Module: ${key}`;
    const start = content.indexOf(heading);
    if (start < 0)
        return "";
    const rest = content.slice(start + heading.length);
    const next = rest.search(/\n## Module: /);
    return next >= 0 ? rest.slice(0, next) : rest;
}
function listModuleTaskPlans({ targetRoot, rel, filePath }) {
    const modulesRoot = filePath(legacyModulesPath);
    if (!fs.existsSync(modulesRoot))
        return [];
    return walkFiles(modulesRoot, {
        dirFilter: (_dirName, fullPath) => {
            const relativePath = rel(path.relative(targetRoot, fullPath));
            return !relativePath.includes("/_archive/") && !relativePath.endsWith("/_task-template");
        },
    })
        .map((file) => rel(path.relative(targetRoot, file)))
        .filter((relativePath) => /\/TASKS\/[^/]+\/task_plan\.md$/.test(relativePath));
}
function parseModuleTaskPath(taskPlanPath) {
    const match = taskPlanPath.match(new RegExp(`^${escapeRegExp(legacyModulesPath)}/([^/]+)/TASKS/([^/]+)/task_plan\\.md$`));
    if (!match)
        return null;
    return { moduleKey: match[1], taskDir: match[2] };
}
function extractStepId(taskPlanContent, taskDir) {
    const fromPlan = taskPlanContent.match(/^- Step ID:\s*`?([A-Z]{2,5}-\d{2})`?/m);
    if (fromPlan)
        return fromPlan[1];
    const fromModuleSection = taskPlanContent.match(/^- Step:\s*`?([A-Z]{2,5}-\d{2})`?/m);
    if (fromModuleSection)
        return fromModuleSection[1];
    const fromDir = taskDir.match(/^([A-Z]{2,5}-\d{2})-/);
    return fromDir ? fromDir[1] : "";
}
function readTaskProgress(taskPlanPath, { exists, read }) {
    const progressPath = taskPlanPath.replace(/task_plan\.md$/, "progress.md");
    return exists(progressPath) ? read(progressPath) : "";
}
function normalizeModuleTaskStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    const aliases = new Map([
        ["未开始", "not-started"],
        ["未启动", "not-started"],
        ["进行中", "in-progress"],
        ["开发中", "in-progress"],
        ["规划审查", "planning-review"],
        ["已完成", "completed"],
        ["完成", "completed"],
        ["已关闭", "closed"],
        ["关闭", "closed"],
        ["已阻塞", "blocked"],
        ["阻塞", "blocked"],
    ]);
    return aliases.get(value) || value;
}
function readTaskProgressStatus(taskPlanPath, context) {
    const progress = readTaskProgress(taskPlanPath, context);
    if (!progress)
        return "";
    const match = progress.match(/^##\s*(?:Status|状态)\s*[:：]?\s*(?:\n\s*)?([^\n]+)/im);
    return match ? normalizeModuleTaskStatus(stripMarkdownCode(match[1])) : "";
}
function isActiveModuleTaskStatus(status) {
    if (!status)
        return false;
    return !new Set([
        "not-started",
        "blocked-not-started",
        "complete",
        "completed",
        "closed",
        "closed-with-residual",
        "closed-local-only",
        "superseded",
    ]).has(status);
}
function hasPendingCoordinatorHandoff(taskPlanContent, progressContent) {
    const combined = `${taskPlanContent}\n${progressContent}`;
    return /Coordinator Handoff/i.test(combined) && /pending-coordinator-pass/i.test(combined);
}
function checkModuleTaskSsotIndex(registryRows, context) {
    const { exists, read, fail, warn, requireGlobalModuleSync } = context;
    const registryByModule = new Map(registryRows.map((cells) => [cells[0], cells]));
    const ledgerContent = exists(legacyLedgerPath) ? read(legacyLedgerPath) : "";
    const taskPlans = listModuleTaskPlans(context);
    for (const taskPlanPath of taskPlans) {
        const parsed = parseModuleTaskPath(taskPlanPath);
        if (!parsed)
            continue;
        const { moduleKey, taskDir } = parsed;
        const modulePlanPath = legacyPath(legacyModuleRoot, moduleKey, "module_plan.md");
        if (!exists(modulePlanPath))
            continue;
        const taskPlan = read(taskPlanPath);
        const taskProgress = readTaskProgress(taskPlanPath, context);
        const taskProgressStatus = readTaskProgressStatus(taskPlanPath, context);
        const taskIsActive = isActiveModuleTaskStatus(taskProgressStatus);
        const stepId = extractStepId(taskPlan, taskDir);
        if (!stepId) {
            if (taskIsActive) {
                fail(`${taskPlanPath} does not expose a Step ID and task directory does not start with <PREFIX-NN>`);
            }
            continue;
        }
        const modulePlan = read(modulePlanPath);
        const moduleRelativeTaskPlan = `TASKS/${taskDir}/task_plan.md`;
        if (!modulePlan.includes(stepId) || !modulePlan.includes(moduleRelativeTaskPlan)) {
            fail(`${modulePlanPath} does not index ${stepId} task plan ${moduleRelativeTaskPlan}`);
        }
        if (!taskIsActive)
            continue;
        const registryRow = registryByModule.get(moduleKey);
        const reviewPath = taskPlanPath.replace(/task_plan\.md$/, "review.md");
        const registrySynced = Boolean(registryRow && registryRow[4] === stepId);
        const ledgerSynced = ledgerContent.includes(taskPlanPath) && (!exists(reviewPath) || ledgerContent.includes(reviewPath));
        if (registrySynced && ledgerSynced)
            continue;
        if (requireGlobalModuleSync) {
            if (!registryRow) {
                fail(`${moduleRegistryPath} does not include active module ${moduleKey} for ${taskPlanPath}`);
            }
            else if (registryRow[4] !== stepId) {
                fail(`${moduleRegistryPath} row ${moduleKey} current step is ${registryRow[4]}, but active task is ${stepId}`);
            }
            if (!ledgerContent.includes(taskPlanPath)) {
                fail(`${legacyLedgerPath} does not index active module task plan ${taskPlanPath}`);
            }
            if (exists(reviewPath) && !ledgerContent.includes(reviewPath)) {
                fail(`${legacyLedgerPath} does not index active module review ${reviewPath}`);
            }
            continue;
        }
        if (hasPendingCoordinatorHandoff(taskPlan, taskProgress)) {
            warn(`${taskPlanPath} has pending coordinator handoff; run coordinator pass before final integration or set HARNESS_REQUIRE_GLOBAL_MODULE_SYNC=1 for strict gate`);
            continue;
        }
        fail(`${taskPlanPath} is active but is neither globally synced nor marked with Coordinator Handoff: pending-coordinator-pass`);
    }
}
export function checkModuleParallelStructure(context) {
    const { exists, read, fail, requireFile, markdownTable } = context;
    if (!exists(moduleRegistryPath))
        return;
    requireFile(legacyPath(legacyModuleRoot, "Session-Prompt-Pack.md"));
    const hasPromptPack = exists(legacyPath(legacyModuleRoot, "Session-Prompt-Pack.md"));
    for (const templateFile of [
        legacyPath(legacyModuleRoot, "_task-template/task_plan.md"),
        legacyPath(legacyModuleRoot, "_task-template/progress.md"),
        legacyPath(legacyModuleRoot, "_task-template/findings.md"),
        legacyPath(legacyModuleRoot, "_task-template/review.md"),
    ]) {
        requireFile(templateFile);
    }
    const registryContent = read(moduleRegistryPath);
    for (const term of ["PREFIX", "Current Step", "Status", "Write Scope"]) {
        if (!registryContent.includes(term)) {
            fail(`${moduleRegistryPath} missing registry column or section: ${term}`);
        }
    }
    const registryRows = markdownTable(registryContent)
        .filter((cells) => cells.length >= 6)
        .filter((cells) => /^(_shared|[a-z][a-z0-9-]*)$/.test(cells[0] || "") && /^[A-Z]{2,5}$/.test(cells[2] || ""));
    if (registryRows.length === 0) {
        fail(`${moduleRegistryPath} has no active module rows`);
    }
    const promptPack = hasPromptPack ? read(legacyPath(legacyModuleRoot, "Session-Prompt-Pack.md")) : "";
    if (hasPromptPack && !/Subagent Worker Invariant|worker[\s\S]{0,120}worktree[\s\S]{0,120}commit SHA/i.test(promptPack)) {
        fail(`${legacyPath(legacyModuleRoot, "Session-Prompt-Pack.md")} missing subagent worker worktree/commit handoff rule`);
    }
    for (const cells of registryRows) {
        const [key, , prefix, branch, currentStep, status] = cells;
        requireFile(legacyPath(legacyModuleRoot, key, "module_plan.md"));
        if (!/^(planned|in-progress|paused|completed)$/.test(status)) {
            fail(`${moduleRegistryPath} row ${key} has invalid status: ${status}`);
        }
        if (currentStep !== `${prefix}-00` && !currentStep.startsWith(`${prefix}-`)) {
            fail(`${moduleRegistryPath} row ${key} current step does not match prefix ${prefix}: ${currentStep}`);
        }
        const branchName = stripMarkdownCode(branch);
        if (!branchName.startsWith("codex/")) {
            fail(`${moduleRegistryPath} row ${key} branch must use codex/ prefix: ${branch}`);
        }
        const block = modulePromptBlock(promptPack, key);
        if (!block) {
            if (!exists(legacyPath(legacyModuleRoot, key, "session_prompt.md"))) {
                fail(`missing module session prompt for ${key}`);
            }
            continue;
        }
        for (const term of [
            "Current Step",
            branchName,
            "Preflight:",
            "Before code edits:",
            "Write scope:",
            "Forbidden without coordination:",
            "Shared Coordination:",
            "Verification:",
            "Closeout:",
            "Stop conditions:",
        ]) {
            if (!block.includes(term)) {
                fail(`module session prompt for ${key} missing required term: ${term}`);
            }
        }
    }
    checkModuleTaskSsotIndex(registryRows, context);
}
function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
