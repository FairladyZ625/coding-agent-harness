// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { toPosix } from "../core-shared.mjs";
import { appendLongRunningContractFile, moduleTemplateFiles, taskFilesForBudget, } from "./template-files.mjs";
import { discoverImplicitHarnessTarget } from "../harness-paths.mjs";
export function planCreateTaskChanges({ target, directory, normalizedModuleKey, normalizedLocale, normalizedBudget, longRunning, presetContext }) {
    const changes = [];
    if (normalizedModuleKey) {
        const moduleDirectory = path.dirname(directory);
        for (const [destination, source] of moduleTemplateFiles({ locale: normalizedLocale })) {
            const destinationPath = path.join(moduleDirectory, destination);
            if (fs.existsSync(destinationPath))
                continue;
            changes.push({
                destination: toPosix(path.relative(target.projectRoot, destinationPath)),
                source,
                action: "create",
            });
        }
    }
    for (const [destination, source] of appendLongRunningContractFile(taskFilesForBudget({ budget: normalizedBudget, locale: normalizedLocale }), {
        locale: normalizedLocale,
        longRunning,
    })) {
        changes.push({
            destination: toPosix(path.relative(target.projectRoot, path.join(directory, destination))),
            source,
            action: "create",
        });
    }
    if (presetContext) {
        for (const evidence of presetContext.evidenceFiles || []) {
            changes.push({ destination: toPosix(evidence.relativePath), source: evidence.source, action: "create" });
        }
        for (const resource of presetContext.resourceFiles || []) {
            changes.push({ destination: toPosix(resource.relativePath), source: resource.source, action: "create" });
        }
        for (const [kind, rows] of Object.entries(presetContext.resourceIndexRows || {})) {
            if (!rows.length)
                continue;
            const destination = kind === "references" ? "references/INDEX.md" : "artifacts/INDEX.md";
            changes.push({
                destination: toPosix(path.relative(target.projectRoot, path.join(directory, destination))),
                source: `preset-${kind}-index`,
                action: "update",
            });
        }
    }
    return changes;
}
export function refreshPresetCommandAudit(target, presetContext, { commandWriteScopes = [], dryRun = false } = {}) {
    const scopes = [...new Set(commandWriteScopes.filter(Boolean))];
    presetContext.audit = {
        ...presetContext.audit,
        presetWriteScopes: presetContext.audit.writeScopes || [],
        commandWriteScopes: scopes,
    };
    for (const evidence of presetContext.evidenceFiles || []) {
        if (evidence.source !== "preset-audit")
            continue;
        evidence.content = `${JSON.stringify(presetContext.audit, null, 2)}\n`;
        if (dryRun)
            continue;
        fs.writeFileSync(path.join(target.projectRoot, evidence.relativePath), evidence.content);
    }
}
export function targetInputFromSessionFile(fromSession) {
    if (!fromSession)
        return "";
    try {
        const parsed = JSON.parse(fs.readFileSync(path.resolve(fromSession), "utf8"));
        return parsed.target || "";
    }
    catch {
        return "";
    }
}
export function resolveImplicitCreateTarget(targetInput, fromSession) {
    const sessionTarget = targetInputFromSessionFile(fromSession);
    if (targetInput && targetInput !== ".")
        return targetInput;
    return sessionTarget || discoverImplicitHarnessTarget(targetInput || ".") || targetInput || "";
}
