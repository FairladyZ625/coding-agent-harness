// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeTarget, normalizeLocale, readFileSafe, readJsonSafe, existsInDocs, walkFiles, toPosix, sanitizeText, slug, visualMapFile, legacyVisualRoadmapFile, inferProjectLocale, } from "./core-shared.mjs";
import { readCapabilityRegistry, detectCapabilities, addCapability, } from "./capability-registry.mjs";
import { buildStatus } from "./check-profiles.mjs";
import { collectAdoption, categorizeWarning, splitWarningMessage } from "./dashboard-data.mjs";
import { listTaskPlanPaths, isActiveTaskState, requiresCanonicalVisualMap, taskCutoverCounters, } from "./task-scanner.mjs";
import { writeDashboardFolder } from "./dashboard-data.mjs";
import { migrationSampleFiles, probeTargetLocale, inspectGitStatus, ensureSessionDir, statusCheckSummary, strictDeferredFromStatus, writeMigrationReport, validateFullCutoverSession, recommendedMigrationCapabilities, migrationPhases, } from "./migration-support.mjs";
export function buildMigrationPlan(targetInput, { limit = 20 } = {}) {
    const target = normalizeTarget(targetInput);
    const status = buildStatus(targetInput, { strict: false, strictLegacy: false, allowLegacyTarget: true });
    const registry = readCapabilityRegistry(target);
    const locale = registry.raw ? registry.locale : inferProjectLocale(target, registry.locale);
    const adoption = collectAdoption(status);
    const warnings = adoption.warnings.map((warning) => warning.detail).filter(Boolean);
    const taskActionsByTask = new Map();
    const reviewActionsByPath = new Map();
    const legacyActions = [];
    const legacyResiduals = [];
    const warningGroups = new Map();
    const tasksByShortId = new Map(status.tasks.map((task) => [task.shortId, task]));
    function addTaskAction(taskId, actionPath, fileName, actionText) {
        const existing = taskActionsByTask.get(taskId) || {
            taskId,
            path: actionPath,
            files: new Set(),
            action: actionText ||
                "Rewrite this task into the v1 task contract by adapting the localized task template and preserving evidence links.",
        };
        existing.files.add(fileName);
        taskActionsByTask.set(taskId, existing);
        return existing;
    }
    for (const warning of warnings) {
        const category = categorizeWarning(warning);
        const group = warningGroups.get(category) || { category, count: 0, examples: [] };
        group.count += 1;
        if (group.examples.length < 3)
            group.examples.push(sanitizeText(warning));
        warningGroups.set(category, group);
        const taskContract = warning.match(/(?:adoption-needed:\s*)?(docs\/09-PLANNING\/TASKS\/([^/\s]+))\s+missing\s+(execution_strategy\.md|visual_map\.md|visual_roadmap\.md)/i);
        if (taskContract) {
            const key = taskContract[2];
            const task = tasksByShortId.get(key);
            const actionFile = taskContract[3] === legacyVisualRoadmapFile ? visualMapFile : taskContract[3];
            const visualGap = actionFile === visualMapFile;
            if (!task || (!isActiveTaskState(task.state) && !(visualGap && requiresCanonicalVisualMap(task)))) {
                legacyResiduals.push({
                    type: "legacy-task-contract-gap",
                    taskId: key,
                    path: `TARGET:${taskContract[1]}`,
                    missing: taskContract[3],
                    reason: "Historical or unknown-state task. Do not migrate mechanically; upgrade only if reopened or reused as current evidence.",
                });
                continue;
            }
            addTaskAction(key, `TARGET:${taskContract[1]}`, actionFile, "For active, reopened, or full-cutover tasks, add standalone v1 task contract files by adapting the localized task template and preserving evidence links.");
            continue;
        }
        const reviewGap = warning.match(/(?:adoption-needed:\s*)?(docs\/[^\s]+\.md)\s+missing\s+(.+)/i);
        if (reviewGap && /Reviewer Identity|Confidence Challenge|Evidence Checked|Final Confidence Basis/i.test(reviewGap[2])) {
            const key = reviewGap[1];
            const existing = reviewActionsByPath.get(key) || {
                path: `TARGET:${key}`,
                missing: new Set(),
                action: "Upgrade this review only if it is active, release-blocking, or reused as current evidence. Otherwise keep it as historical material.",
            };
            existing.missing.add(reviewGap[2]);
            reviewActionsByPath.set(key, existing);
            continue;
        }
        const legacyRequired = warning.match(/-\s+missing required file:\s+([^\s]+)/i);
        if (legacyRequired) {
            legacyActions.push({
                type: "missing-reference",
                path: `TARGET:${legacyRequired[1]}`,
                action: "Create or adapt this reference only when the related capability is intentionally adopted.",
            });
        }
    }
    const legacyVisualOnlyTasks = [];
    const unknownClassificationTasks = [];
    const weakBriefTasks = [];
    for (const task of status.tasks) {
        if (task.visualMapStatus === "legacy-only") {
            legacyVisualOnlyTasks.push({
                taskId: task.shortId,
                path: task.path,
                classification: task.migrationClassification,
                action: "Rewrite legacy visual_roadmap.md into canonical visual_map.md. Do not keep it as the active task map.",
            });
        }
        if (task.migrationClassification === "unknown-needs-human") {
            unknownClassificationTasks.push({
                taskId: task.shortId,
                path: task.path,
                state: task.state,
                action: "Classify whether this is active, reopened, current evidence, historical-with-diagram, or historical-no-map-needed before full cutover.",
            });
        }
        if (task.briefQuality?.status !== "pass") {
            weakBriefTasks.push({
                taskId: task.shortId,
                path: task.path,
                issues: task.briefQuality?.issues || [],
                action: "Rewrite brief.md so a human can understand the goal, status, evidence, risks, and next action without opening the full task archive.",
            });
            addTaskAction(task.shortId, task.path, "brief.md", "Rewrite the human brief and preserve links to source task evidence.");
        }
        if (requiresCanonicalVisualMap(task) && task.visualMapSource !== "canonical") {
            addTaskAction(task.shortId, task.path, visualMapFile, "Rewrite task diagrams into canonical visual_map.md. Legacy visual_roadmap.md is read-only migration input.");
        }
        if (isActiveTaskState(task.state) && task.briefSource !== "standalone") {
            addTaskAction(task.shortId, task.path, "brief.md", "For active or reopened tasks, add standalone v1 task contract files by adapting the localized task template and preserving evidence links.");
        }
    }
    const taskActions = [...taskActionsByTask.values()].map((action) => ({
        ...action,
        files: [...action.files].sort(),
        commands: [
            ...[...action.files].sort().map((file) => `copy/adapt docs/09-PLANNING/TASKS/_task-template/${file} into ${action.path}`),
            `node scripts/harness.mjs task-log ${action.taskId} --message "migrated active task contract" ${target.projectRoot}`,
        ],
    }));
    const reviewActions = [...reviewActionsByPath.values()].map((action) => ({
        ...action,
        missing: [...action.missing].sort(),
    }));
    const recommendedCapabilities = recommendedMigrationCapabilities(status, target, registry);
    const missingExecutionStrategy = taskActions.filter((action) => action.files.includes("execution_strategy.md")).length;
    const missingVisualMap = taskActions.filter((action) => action.files.includes(visualMapFile)).length;
    const cutoverCounters = taskCutoverCounters(status.tasks);
    const visualMapActions = taskActions.filter((action) => action.files.includes(visualMapFile)).length;
    const fullCutoverEligible = status.checkState.status === "pass" &&
        taskActions.length === 0 &&
        reviewActions.length === 0 &&
        legacyActions.length === 0 &&
        legacyResiduals.length === 0 &&
        recommendedCapabilities.length === 0 &&
        cutoverCounters.legacyVisualOnlyCount === 0 &&
        cutoverCounters.unknownClassificationCount === 0 &&
        cutoverCounters.weakBriefCount === 0 &&
        cutoverCounters.missingCanonicalVisualMapCount === 0;
    return {
        operation: "migrate-plan",
        target: target.projectRoot,
        locale,
        mode: status.mode,
        compatibility: {
            preserves: [
                "AGENTS.md and CLAUDE.md are never overwritten by safe-adoption.",
                "Existing Harness-Ledger, SSoT, walkthrough, progress, review, and historical task plans are preserved.",
                "Closed historical tasks may remain in legacy format unless they become active evidence for a strict gate.",
            ],
            strictGate: "Normal migration mode reports adoption-needed warnings; --strict remains available as the final cutover gate.",
        },
        summary: {
            tasks: status.tasks.length,
            warnings: warnings.length,
            missingExecutionStrategy,
            missingVisualMap,
            missingVisualRoadmap: missingVisualMap,
            visualMapActions,
            legacyVisualOnly: legacyVisualOnlyTasks.length,
            unknownClassification: unknownClassificationTasks.length,
            weakBrief: weakBriefTasks.length,
            missingCanonicalVisualMap: cutoverCounters.missingCanonicalVisualMapCount,
            taskActions: taskActions.length,
            reviewSchemaGaps: reviewActions.length,
            legacyReferenceGaps: legacyActions.length,
            legacyResiduals: legacyResiduals.length,
            recommendedCapabilities: recommendedCapabilities.map((capability) => capability.name),
            fullCutoverEligible,
        },
        recommendedCapabilities,
        phases: migrationPhases({ locale, recommendedCapabilities }),
        taskActions: taskActions.slice(0, limit),
        visualMapActions: taskActions.filter((action) => action.files.includes(visualMapFile)).slice(0, limit),
        legacyVisualOnlyTasks: legacyVisualOnlyTasks.slice(0, limit),
        unknownClassificationTasks: unknownClassificationTasks.slice(0, limit),
        weakBriefTasks: weakBriefTasks.slice(0, limit),
        reviewActions: reviewActions.slice(0, limit),
        legacyActions: legacyActions.slice(0, limit),
        legacyResiduals: legacyResiduals.slice(0, limit),
        warningGroups: [...warningGroups.values()],
        warningQueue: adoption.warnings.slice(0, limit),
        nextCommands: [
            `harness migrate-structure --plan ${target.projectRoot}`,
            `harness migrate-structure --apply ${target.projectRoot}`,
            `harness check --profile target-project ${target.projectRoot}`,
            `harness dashboard --out-dir /tmp/cah-v2-dashboard-${slug(status.project.name)} ${target.projectRoot}`,
        ],
    };
}
export function runMigration(targetInput, options = {}) {
    const target = normalizeTarget(targetInput);
    const targetLabel = target.projectRoot;
    const beforeGit = inspectGitStatus(target.projectRoot);
    if (beforeGit.error)
        throw new Error(`Could not inspect git status: ${beforeGit.error.trim()}`);
    if (beforeGit.dirty && !options.allowDirty) {
        throw new Error(`Target git worktree is dirty; rerun with --allow-dirty after reviewing changes.\n${beforeGit.entries.join("\n")}`);
    }
    const localeProbe = probeTargetLocale(target);
    if (!options.locale && localeProbe.mixedLanguageDetected && !options.assumeLocale) {
        throw new Error(`Target contains mixed Chinese/English harness text. Choose explicitly with --locale zh-CN or --locale en-US.\nProbe: ${JSON.stringify(localeProbe.totals)}`);
    }
    const selectedLocale = normalizeLocale(options.locale || localeProbe.suggested);
    const baselineStatus = buildStatus(targetInput, { strict: false, strictLegacy: false, allowLegacyTarget: true });
    const initialPlan = buildMigrationPlan(targetInput, { limit: options.limit || 50 });
    const sessionDir = ensureSessionDir(path.basename(target.projectRoot), options.sessionDir || "");
    const dashboardDir = options.outDir ? path.resolve(options.outDir) : path.join(sessionDir, "dashboard");
    let safeAdoption = null;
    let dashboardCapability = null;
    const safeAdoptionDryRun = addCapability(targetInput, "safe-adoption", { dryRun: true, locale: selectedLocale });
    const dashboardDryRun = addCapability(targetInput, "dashboard", { dryRun: true, locale: selectedLocale });
    let dashboardIndex = "";
    if (!options.planOnly) {
        safeAdoption = addCapability(targetInput, "safe-adoption", { dryRun: false, locale: selectedLocale });
        dashboardCapability = addCapability(targetInput, "dashboard", { dryRun: false, locale: selectedLocale });
        const writtenDashboardDir = writeDashboardFolder(dashboardDir, targetInput);
        dashboardIndex = path.join(writtenDashboardDir, "index.html");
    }
    const normalStatus = buildStatus(targetInput, { strict: false, strictLegacy: false, allowLegacyTarget: true });
    const strictStatus = buildStatus(targetInput, { strict: true, strictLegacy: true, allowLegacyTarget: true });
    const finalPlan = buildMigrationPlan(targetInput, { limit: options.limit || 50 });
    const afterGit = inspectGitStatus(target.projectRoot);
    const strictDeferred = strictDeferredFromStatus(strictStatus);
    const result = options.planOnly
        ? "plan-only"
        : normalStatus.checkState.status === "fail"
            ? "failed"
            : strictStatus.checkState.status === "fail"
                ? "adopted-with-strict-deferred"
                : "complete";
    const session = {
        operation: "migrate-run",
        version: 1,
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        result,
        target: targetLabel,
        sessionDir,
        planOnly: Boolean(options.planOnly),
        localeDecision: {
            selected: selectedLocale,
            source: options.locale ? "explicit" : localeProbe.mixedLanguageDetected ? "assumed-from-probe" : "probe",
            probe: localeProbe,
        },
        capabilities: readCapabilityRegistry(target).capabilities,
        baseline: {
            statusPath: path.join(sessionDir, "baseline-status.json"),
            migratePlanPath: path.join(sessionDir, "migrate-plan.json"),
            taskCount: baselineStatus.tasks.length,
            warningCount: baselineStatus.checkState.warnings,
        },
        dryRun: {
            safeAdoption: safeAdoptionDryRun.report,
            dashboard: dashboardDryRun.report,
        },
        capabilityReports: {
            safeAdoption: safeAdoption?.report || null,
            dashboard: dashboardCapability?.report || null,
        },
        dashboard: dashboardIndex ? { dir: dashboardDir, indexPath: dashboardIndex, kind: "html-folder" } : null,
        plan: finalPlan,
        checks: {
            normal: statusCheckSummary(normalStatus),
            strict: statusCheckSummary(strictStatus),
        },
        strictDeferred,
        git: {
            before: beforeGit,
            after: afterGit,
        },
    };
    const sessionPath = path.join(sessionDir, "session.json");
    fs.writeFileSync(path.join(sessionDir, "baseline-status.json"), `${JSON.stringify(baselineStatus, null, 2)}\n`);
    fs.writeFileSync(path.join(sessionDir, "migrate-plan.json"), `${JSON.stringify(initialPlan, null, 2)}\n`);
    fs.writeFileSync(path.join(sessionDir, "status-normal.json"), `${JSON.stringify(normalStatus, null, 2)}\n`);
    fs.writeFileSync(path.join(sessionDir, "status-strict.json"), `${JSON.stringify(strictStatus, null, 2)}\n`);
    fs.writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
    const reportPath = path.join(sessionDir, "report.md");
    fs.writeFileSync(reportPath, writeMigrationReport(session));
    return { ...session, sessionPath, reportPath };
}
export function verifyMigrationSession(sessionPathInput, { fullCutover = false } = {}) {
    const sessionPath = path.resolve(sessionPathInput || "");
    if (!sessionPath || !fs.existsSync(sessionPath)) {
        return { operation: "migrate-verify", status: "fail", failures: [`session file not found: ${sessionPathInput}`], warnings: [] };
    }
    const failures = [];
    const warnings = [];
    let readError = null;
    const session = readJsonSafe(sessionPath, null, { onError: (error) => { readError = error; } });
    if (!session)
        return { operation: "migrate-verify", status: "fail", failures: [`invalid session json: ${readError?.message || "unknown parse error"}`], warnings };
    if (session.operation !== "migrate-run")
        failures.push("session operation is not migrate-run");
    if (session.schemaVersion !== 1 && session.version !== 1)
        failures.push("session missing schema version");
    if (session.planOnly)
        failures.push("plan-only session is not completed migration evidence; rerun migrate-run without --plan-only");
    if (!session.generatedAt)
        failures.push("session missing generatedAt");
    if (!session.sessionDir || !fs.existsSync(session.sessionDir))
        failures.push(`sessionDir missing: ${session.sessionDir || "(none)"}`);
    if (!session.plan?.operation)
        failures.push("session missing migration plan");
    if (!session.checks?.normal || !session.checks?.strict)
        failures.push("session missing recorded normal/strict checks");
    if (!session.git?.before || !session.git?.after)
        failures.push("session missing git audit metadata");
    if (session.git?.before && session.git.before.inGit !== true)
        failures.push("migration target was not recorded as a git worktree");
    if (session.git?.after && session.git.after.inGit !== true)
        failures.push("migration target after-state was not recorded as a git worktree");
    if (!session.target || !fs.existsSync(session.target))
        failures.push(`target missing: ${session.target || "(none)"}`);
    if (!session.localeDecision?.selected)
        failures.push("session missing locale decision");
    if (session.git?.after?.staged?.length)
        failures.push(`migration left staged files: ${session.git.after.staged.join(", ")}`);
    if (session.target && fs.existsSync(session.target)) {
        const target = normalizeTarget(session.target);
        const currentGit = inspectGitStatus(target.projectRoot);
        if (currentGit.error)
            failures.push(`could not inspect current git status: ${currentGit.error.trim()}`);
        if (currentGit.inGit !== true)
            failures.push("target is not currently a git worktree");
        if (currentGit.staged.length)
            failures.push(`target currently has staged files: ${currentGit.staged.join(", ")}`);
        if (!session.planOnly) {
            const registry = readCapabilityRegistry(target);
            const capabilities = new Set(registry.capabilities.map((capability) => capability.name));
            if (!registry.raw)
                failures.push(".harness-capabilities.json was not created");
            for (const required of ["safe-adoption", "dashboard"]) {
                if (!capabilities.has(required))
                    failures.push(`required capability missing: ${required}`);
            }
            if (session.localeDecision?.selected && registry.locale !== session.localeDecision.selected) {
                failures.push(`registry locale ${registry.locale} does not match session locale ${session.localeDecision.selected}`);
            }
        }
        const normal = buildStatus(target.projectRoot, { strict: false, strictLegacy: false, allowLegacyTarget: true });
        if (normal.checkState.status === "fail")
            failures.push(`normal check fails with ${normal.checkState.failures} failures`);
        const strict = buildStatus(target.projectRoot, { strict: true, strictLegacy: true, allowLegacyTarget: true });
        if (strict.checkState.status === "fail") {
            const deferred = session.strictDeferred;
            if (session.result === "complete")
                failures.push("session claims complete while current strict check fails");
            if (!deferred?.owner || !deferred?.trigger || !deferred?.nextAction || !deferred?.failureCount) {
                failures.push("current strict failures need strictDeferred owner, trigger, nextAction, and failureCount");
            }
            else {
                warnings.push(`current strict cutover deferred: ${strict.checkState.failures} failures`);
            }
        }
    }
    if (!session.planOnly) {
        const indexPath = session.dashboard?.indexPath || "";
        const dashboardDir = session.dashboard?.dir || "";
        if (!indexPath)
            failures.push("session missing dashboard index path");
        if (indexPath && !/\.html?$/i.test(indexPath))
            failures.push(`dashboard index is not HTML: ${indexPath}`);
        if (indexPath && path.basename(indexPath) !== "index.html")
            failures.push(`dashboard index must be index.html: ${indexPath}`);
        if (indexPath && !fs.existsSync(indexPath))
            failures.push(`dashboard index not found: ${indexPath}`);
        if (/\.md$/i.test(indexPath))
            failures.push(`dashboard path points to Markdown: ${indexPath}`);
        if (indexPath && dashboardDir && path.resolve(indexPath) !== path.join(path.resolve(dashboardDir), "index.html")) {
            failures.push(`dashboard index is not inside dashboard dir: ${indexPath}`);
        }
        for (const required of ["assets/dashboard-data.js", "data/status.json", "data/adoption.json"]) {
            if (dashboardDir && !fs.existsSync(path.join(dashboardDir, required)))
                failures.push(`dashboard folder missing ${required}`);
        }
        const dashboardHtml = indexPath && fs.existsSync(indexPath) ? readFileSafe(indexPath) : "";
        if (dashboardHtml && !dashboardHtml.includes("dashboard-data.js"))
            failures.push("dashboard index does not load dashboard-data.js");
        const dataScriptPath = dashboardDir ? path.join(dashboardDir, "assets/dashboard-data.js") : "";
        const dataScript = dataScriptPath && fs.existsSync(dataScriptPath) ? readFileSafe(dataScriptPath) : "";
        const dataMatch = dataScript.match(/window\.__HARNESS_DASHBOARD__\s*=\s*([\s\S]*);\s*$/);
        if (!dataMatch) {
            failures.push("dashboard-data.js does not contain a generated dashboard bundle");
        }
        else {
            try {
                const dashboardBundle = JSON.parse(dataMatch[1]);
                const expectedProjectName = session.target ? path.basename(session.target) : "";
                if (dashboardBundle.status?.schemaVersion !== 2)
                    failures.push("dashboard bundle missing status schemaVersion 2");
                if (expectedProjectName && dashboardBundle.status?.project?.name !== expectedProjectName) {
                    failures.push(`dashboard bundle project ${dashboardBundle.status?.project?.name || "(none)"} does not match target ${expectedProjectName}`);
                }
                if (!dashboardBundle.status?.checkState)
                    failures.push("dashboard bundle missing checkState");
                if (!Array.isArray(dashboardBundle.adoption?.warnings))
                    failures.push("dashboard bundle missing adoption warnings array");
            }
            catch (error) {
                failures.push(`dashboard-data.js contains invalid dashboard JSON: ${error.message}`);
            }
        }
    }
    if (session.checks?.normal?.status === "fail")
        failures.push("recorded normal check failed");
    if (session.checks?.strict?.status === "fail") {
        const deferred = session.strictDeferred;
        if (!deferred?.owner || !deferred?.trigger || !deferred?.nextAction || !deferred?.failureCount) {
            failures.push("strict failures need strictDeferred owner, trigger, nextAction, and failureCount");
        }
        else {
            warnings.push(`strict cutover deferred: ${deferred.failureCount} failures`);
        }
    }
    if (fullCutover)
        validateFullCutoverSession(session, failures);
    return {
        operation: "migrate-verify",
        status: failures.length ? "fail" : "pass",
        fullCutover: Boolean(fullCutover),
        sessionPath,
        target: session.target || "",
        result: session.result || "",
        dashboard: session.dashboard || null,
        strictDeferred: session.strictDeferred || null,
        failures,
        warnings,
    };
}
