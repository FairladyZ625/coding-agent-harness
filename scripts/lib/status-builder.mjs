// @ts-nocheck
import path from "node:path";
import { normalizeTarget, toPosix } from "./core-shared.mjs";
import { capabilityDefinitions, readCapabilityRegistry } from "./capability-registry.mjs";
import { summarizeGitState } from "./git-status-summary.mjs";
import { collectTasks, taskCutoverCounters } from "./task-scanner.mjs";
export function buildStatusData(targetInput, options = {}) {
    const target = targetInput?.projectRoot ? targetInput : normalizeTarget(targetInput);
    const validationMode = options.validationMode || "data-only";
    const gitState = options.gitState || summarizeGitState(target);
    const registry = options.capabilityState?.registry || readCapabilityRegistry(target);
    const detected = options.capabilityState?.detected || [];
    const capabilityWarnings = options.capabilityState?.warnings || [];
    const failures = [...(options.failures || [])];
    const warnings = [...(options.warnings || [])];
    const legacy = options.legacy || { status: "skipped", code: 0, stdout: "", stderr: "" };
    const tasks = options.tasks || collectTasks(target, {
        requireGeneratedScaffoldProvenance: options.requireGeneratedScaffoldProvenance === true,
        taskPlanPaths: options.taskPlanPaths,
        closeoutContent: options.closeoutContent,
    });
    const briefReady = tasks.filter((task) => task.briefSource === "standalone").length;
    const briefMissing = tasks.length - briefReady;
    const capabilityNames = new Map(registry.capabilities.map((capability) => [capability.name, capability]));
    for (const capability of detected) {
        if (!capabilityNames.has(capability))
            capabilityNames.set(capability, { name: capability, state: "configured" });
    }
    const cutoverCounters = taskCutoverCounters(tasks);
    const fullCutoverEligible = validationMode === "validated" &&
        failures.length === 0 &&
        warnings.length === 0 &&
        cutoverCounters.legacyVisualOnlyCount === 0 &&
        cutoverCounters.unknownClassificationCount === 0 &&
        cutoverCounters.weakBriefCount === 0 &&
        cutoverCounters.missingCanonicalVisualMapCount === 0;
    return {
        project: {
            name: path.basename(target.projectRoot),
            root: `TARGET:${target.docsOnly ? toPosix(path.relative(target.projectRoot, target.docsRoot)) : "."}`,
            docsOnly: target.docsOnly,
        },
        schemaVersion: 2,
        generatedAt: options.generatedAt || new Date().toISOString(),
        mode: registry.mode,
        checkState: {
            status: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
            validationMode,
            failures: failures.length,
            warnings: warnings.length,
            details: { failures, warnings },
            legacy,
        },
        git: gitState.summary,
        summary: {
            tasks: tasks.length,
            briefCoverage: {
                ready: briefReady,
                missing: briefMissing,
                total: tasks.length,
            },
            visualMapCoverage: {
                canonical: tasks.filter((task) => task.visualMapSource === "canonical").length,
                legacyOnly: cutoverCounters.legacyVisualOnlyCount,
                missing: tasks.filter((task) => task.visualMapStatus === "missing").length,
                total: tasks.length,
            },
            fullCutoverEligible,
            legacyVisualOnlyCount: cutoverCounters.legacyVisualOnlyCount,
            unknownClassificationCount: cutoverCounters.unknownClassificationCount,
            weakBriefCount: cutoverCounters.weakBriefCount,
            visualMapRequiredCount: cutoverCounters.visualMapRequiredCount,
            missingCanonicalVisualMapCount: cutoverCounters.missingCanonicalVisualMapCount,
        },
        capabilities: [...capabilityNames.values()].map((capability) => ({
            name: capability.name,
            state: capability.state || "configured",
            dependencyStatus: capabilityDefinitions[capability.name]?.dependencies.every((dependency) => capabilityNames.has(dependency))
                ? "valid"
                : "invalid",
            warnings: capabilityWarnings.filter((warning) => warning.includes(capability.name)),
        })),
        tasks,
        handoffs: tasks.flatMap((task) => task.handoffs || []),
        recentActivity: tasks.slice(0, 8).map((task) => ({ at: new Date().toISOString(), type: "task", summary: task.title })),
    };
}
