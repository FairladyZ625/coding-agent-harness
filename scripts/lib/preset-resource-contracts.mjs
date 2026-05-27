import fs from "node:fs";
import path from "node:path";
// @ts-ignore core-shared remains a JS runtime dependency until its migration PR.
import { readFileSafe, toPosix } from "./core-shared.mjs";
export function validatePresetResourcesForTask(target, task, presetPackage) {
    const failures = [];
    const taskRelativePath = String(task.path || "").replace(/^TARGET:/, "").replace(/^\/+/, "");
    if (!taskRelativePath)
        return failures;
    const taskDir = path.join(target.projectRoot, taskRelativePath);
    const referenceIndex = readFileSafe(path.join(taskDir, "references/INDEX.md"));
    const referenceRows = parseMarkdownRows(referenceIndex, ["ID", "Path"]);
    const artifactIndex = readFileSafe(path.join(taskDir, "artifacts/INDEX.md"));
    const artifactRows = parseMarkdownRows(artifactIndex, ["ID", "Path"]);
    const taskPlan = task.taskPlanPath ? readFileSafe(path.join(target.projectRoot, String(task.taskPlanPath).replace(/^TARGET:/, "").replace(/^\/+/, ""))) : "";
    const requiredReadRows = parseMarkdownRows(taskPlan, ["Reference", "Path"]);
    const expectedReferencePaths = new Map();
    for (const resource of Object.values(presetPackage.resources?.references || {})) {
        const relativePath = toPosix(path.join(taskRelativePath, resource.path));
        expectedReferencePaths.set(resource.index.id, `TARGET:${relativePath}`);
        if (!fs.existsSync(path.join(target.projectRoot, relativePath))) {
            failures.push(`${task.path} ${task.taskPreset} preset resource missing: TARGET:${relativePath}`);
        }
        if (!hasIndexedResource(referenceRows, resource.index.id, `TARGET:${relativePath}`)) {
            failures.push(`${task.path} ${task.taskPreset} preset reference index missing ${resource.index.id}`);
        }
    }
    for (const resource of Object.values(presetPackage.resources?.artifacts || {})) {
        const relativePath = toPosix(path.join(taskRelativePath, resource.path));
        if (!fs.existsSync(path.join(target.projectRoot, relativePath))) {
            failures.push(`${task.path} ${task.taskPreset} preset resource missing: TARGET:${relativePath}`);
        }
        if (!hasIndexedResource(artifactRows, resource.index.id, `TARGET:${relativePath}`)) {
            failures.push(`${task.path} ${task.taskPreset} preset artifact index missing ${resource.index.id}`);
        }
    }
    for (const requiredRead of presetPackage.context?.requiredReads || []) {
        const expectedPath = expectedReferencePaths.get(requiredRead);
        if (!referenceRows.some((row) => row.ID === requiredRead && (!expectedPath || row.Path === expectedPath))) {
            failures.push(`${task.path} ${task.taskPreset} preset required read missing from references index: ${requiredRead}`);
        }
        if (!requiredReadRows.some((row) => row.Reference === requiredRead && (!expectedPath || row.Path === expectedPath))) {
            failures.push(`${task.path} ${task.taskPreset} preset required read missing from task plan: ${requiredRead}`);
        }
    }
    return failures;
}
function hasIndexedResource(rows, id, expectedPath) {
    return rows.some((row) => row.ID === id && row.Path === expectedPath);
}
function parseMarkdownRows(markdown, requiredColumns) {
    const rows = [];
    const lines = String(markdown || "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        const next = lines[index + 1]?.trim() || "";
        if (!isTableRow(line) || !isTableSeparator(next))
            continue;
        const header = splitTableRow(line);
        if (!requiredColumns.every((column) => header.includes(column)))
            continue;
        index += 2;
        while (index < lines.length && isTableRow(lines[index].trim())) {
            const cells = splitTableRow(lines[index].trim());
            if (cells.length === header.length)
                rows.push(Object.fromEntries(header.map((column, cellIndex) => [column, cells[cellIndex] || ""])));
            index += 1;
        }
        index -= 1;
    }
    return rows;
}
function isTableRow(line) {
    return line.startsWith("|") && line.endsWith("|");
}
function isTableSeparator(line) {
    if (!isTableRow(line))
        return false;
    return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}
function splitTableRow(line) {
    return line.slice(1, -1).split("|").map((cell) => cell.trim());
}
