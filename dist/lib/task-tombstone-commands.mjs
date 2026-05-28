// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { normalizeTarget, nowTimestamp, readFileSafe, toPosix, datePrefix, } from "./core-shared.mjs";
import { collectTasks } from "./task-scanner.mjs";
import { beginGovernanceSync, commitGovernanceSync, releaseGovernanceSync, } from "./governance-sync.mjs";
export function supersedeTask(targetInput, oldRef, { by = "", reason = "" } = {}) {
    if (!by)
        throw new Error("task-supersede requires --by <new-task-id>");
    const target = normalizeTarget(targetInput);
    const oldTask = resolveTask(target, oldRef);
    const newTask = resolveTask(target, by);
    const governanceContext = beginGovernanceSync(target, { operation: `task-supersede ${oldTask.id}` });
    try {
        writeTombstone(target, oldTask, {
            State: "superseded",
            "Superseded By": newTask.id,
            Reason: reason || "superseded",
            Operator: "coordinator",
            Timestamp: nowTimestamp(),
            "Reopen Eligible": "yes",
            "Archive Eligible": "no",
        });
        appendProgress(target, oldTask, `task-supersede: superseded by ${newTask.id}`, reason || "superseded");
        appendSupersedes(target, newTask, oldTask.id);
        const commit = commitGovernanceSync(contextFor(target, governanceContext), taskPaths(target, oldTask, newTask), {
            message: `chore(harness): supersede task ${oldTask.id}`,
        });
        return { taskId: oldTask.id, supersededBy: newTask.id, reason: reason || "superseded", governance: { commit } };
    }
    finally {
        releaseGovernanceSync(governanceContext);
    }
}
export function softDeleteTask(targetInput, taskRef, { reason = "" } = {}) {
    const target = normalizeTarget(targetInput);
    const task = resolveTask(target, taskRef);
    return writeDeletionState(target, task, "soft-deleted", reason || "soft-delete", "task-delete --soft");
}
export function archiveTask(targetInput, taskRef, { reason = "" } = {}) {
    const target = normalizeTarget(targetInput);
    const task = resolveTask(target, taskRef);
    return writeDeletionState(target, task, "archived", reason || "archive", "task-archive");
}
export function reopenTask(targetInput, taskRef, { reason = "" } = {}) {
    const target = normalizeTarget(targetInput);
    const task = resolveTask(target, taskRef);
    const governanceContext = beginGovernanceSync(target, { operation: `task-reopen ${task.id}` });
    try {
        const taskPlanPath = path.join(target.projectRoot, task.taskPlanPath.replace(/^TARGET:/, ""));
        const content = readFileSafe(taskPlanPath);
        const next = content.replace(/\n##\s*(?:Task Tombstone|任务墓碑)\s*$[\s\S]*?(?=^##\s+|(?![\s\S]))/im, "");
        fs.writeFileSync(taskPlanPath, next.endsWith("\n") ? next : `${next}\n`);
        appendProgress(target, task, "task-reopen", reason || "reopened");
        const commit = commitGovernanceSync(governanceContext, taskPaths(target, task), {
            message: `chore(harness): reopen task ${task.id}`,
        });
        return { taskId: task.id, deletionState: "active", reason: reason || "reopened", governance: { commit } };
    }
    finally {
        releaseGovernanceSync(governanceContext);
    }
}
function writeDeletionState(target, task, deletionState, reason, action) {
    const governanceContext = beginGovernanceSync(target, { operation: `${action} ${task.id}` });
    try {
        writeTombstone(target, task, {
            State: deletionState,
            Reason: reason,
            Operator: "coordinator",
            Timestamp: nowTimestamp(),
            "Reopen Eligible": "yes",
            "Archive Eligible": deletionState === "archived" ? "yes" : "no",
        });
        appendProgress(target, task, action, reason);
        const commit = commitGovernanceSync(governanceContext, taskPaths(target, task), {
            message: `chore(harness): ${action.replace(/\s+/g, " ")} ${task.id}`,
        });
        return { taskId: task.id, deletionState, reason, governance: { commit } };
    }
    finally {
        releaseGovernanceSync(governanceContext);
    }
}
function taskPaths(target, ...tasks) {
    return [...new Set(tasks.flatMap((task) => [task.taskPlanPath, task.progressPath]).filter(Boolean).map((item) => toPosix(item.replace(/^TARGET:/, ""))))];
}
function contextFor(_target, context) {
    return context;
}
function resolveTask(target, ref) {
    const normalized = String(ref || "").trim();
    const matches = collectTasks(target).filter((task) => {
        const bare = datePrefix.test(task.shortId) ? task.shortId.replace(datePrefix, "") : task.shortId;
        return task.id === normalized || task.shortId === normalized || task.id.endsWith(`/${normalized}`) || bare === normalized;
    });
    if (matches.length === 1)
        return matches[0];
    if (matches.length > 1)
        throw new Error(`Ambiguous task reference: ${ref}`);
    throw new Error(`Task not found: ${ref}`);
}
function writeTombstone(target, task, fields) {
    const taskPlanPath = path.join(target.projectRoot, task.taskPlanPath.replace(/^TARGET:/, ""));
    const content = readFileSafe(taskPlanPath).replace(/\n##\s*(?:Task Tombstone|任务墓碑)\s*$[\s\S]*?(?=^##\s+|(?![\s\S]))/im, "");
    const block = ["", "## Task Tombstone", "", "| Field | Value |", "| --- | --- |", ...Object.entries(fields).map(([key, value]) => `| ${key} | ${escapeCell(value)} |`), ""].join("\n");
    fs.writeFileSync(taskPlanPath, `${content.trimEnd()}\n${block}`);
}
function appendSupersedes(target, task, oldId) {
    const taskPlanPath = path.join(target.projectRoot, task.taskPlanPath.replace(/^TARGET:/, ""));
    const content = readFileSafe(taskPlanPath);
    if (/^Supersedes\s*[:：]/im.test(content)) {
        fs.writeFileSync(taskPlanPath, content.replace(/^Supersedes\s*[:：]\s*(.*)$/im, (_m, current) => `Supersedes: ${[current, oldId].filter(Boolean).join(", ")}`));
        return;
    }
    fs.writeFileSync(taskPlanPath, `${content.trimEnd()}\nSupersedes: ${oldId}\n`);
}
function appendProgress(target, task, action, reason) {
    const progressPath = path.join(target.projectRoot, task.progressPath.replace(/^TARGET:/, ""));
    const relative = toPosix(path.relative(target.projectRoot, progressPath));
    fs.appendFileSync(progressPath, `\n\n## Tombstone Log\n\n- ${nowTimestamp()} ${action}: ${escapeCell(reason)} (${relative})\n`);
}
function escapeCell(value) {
    return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}
