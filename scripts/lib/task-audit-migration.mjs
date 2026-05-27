// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { normalizeTarget, readFileSafe, toPosix } from "./core-shared.mjs";
import { listTaskPlanPaths, taskIdForDirectory } from "./task-scanner.mjs";
import { extractLegacyBlock, fieldsFromMarkdownBlock, humanReviewConfirmationHeadingPattern, isConcreteAuditField, legacyExtraFieldsJson, parseTaskAuditMetadata, replaceTaskAuditMetadata, scaffoldProvenanceHeadingPattern, stripLegacyAuditBlocks, taskAuditFieldOrder, } from "./task-audit-metadata.mjs";
import { firstColumn, markdownTableRows } from "./markdown-utils.mjs";
const scaffoldFieldMap = new Map([
    ["created by", "Created By"],
    ["command", "Command Shape"],
    ["command shape", "Command Shape"],
    ["created at", "Created At"],
    ["budget", "Budget"],
    ["template source", "Template Source"],
    ["exception reason", "Exception Reason"],
]);
const reviewFieldMap = new Map([
    ["confirmation id", "Confirmation ID"],
    ["confirmed at", "Confirmed At"],
    ["reviewer", "Reviewer"],
    ["reviewer email", "Reviewer Email"],
    ["confirm text", "Confirm Text"],
    ["evidence", "Evidence Checked"],
    ["evidence checked", "Evidence Checked"],
    ["commit sha", "Review Commit SHA"],
    ["review commit sha", "Review Commit SHA"],
    ["audit status", "Audit Status"],
    ["message", "Message"],
]);
const requiredScaffold = ["Created By", "Created At", "Command Shape", "Budget", "Template Source"];
const requiredReview = ["Confirmation ID", "Confirmed At", "Reviewer", "Reviewer Email", "Confirm Text", "Evidence Checked", "Review Commit SHA", "Audit Status"];
export function planTaskAuditIndexMigration(targetInput) {
    const target = normalizeTarget(targetInput);
    const actions = [];
    const failures = [];
    for (const taskPlanPath of listTaskPlanPaths(target)) {
        const taskDir = path.dirname(taskPlanPath);
        const taskId = taskIdForDirectory(target, taskDir);
        const indexPath = path.join(taskDir, "INDEX.md");
        const briefPath = path.join(taskDir, "brief.md");
        const reviewPath = path.join(taskDir, "review.md");
        const indexContent = readFileSafe(indexPath);
        const briefContent = readFileSafe(briefPath);
        const reviewContent = readFileSafe(reviewPath);
        const scaffoldBlock = extractLegacyBlock(briefContent, scaffoldProvenanceHeadingPattern);
        const reviewBlock = extractLegacyBlock(reviewContent, humanReviewConfirmationHeadingPattern);
        const audit = parseTaskAuditMetadata(indexContent, { required: true });
        if (!scaffoldBlock && !reviewBlock && audit.issues.length === 0)
            continue;
        const parsed = parseLegacyAudit({ taskId, indexContent, scaffoldBlock, reviewBlock });
        if (parsed.failures.length) {
            failures.push(...parsed.failures.map((failure) => ({ taskId, path: `TARGET:${toPosix(path.relative(target.projectRoot, taskDir))}`, failure })));
            continue;
        }
        actions.push({
            taskId,
            path: `TARGET:${toPosix(path.relative(target.projectRoot, taskDir))}`,
            legacyBlocks: [scaffoldBlock ? "brief.md#Scaffold Provenance" : "", reviewBlock ? "review.md#Human Review Confirmation" : ""].filter(Boolean),
            fields: parsed.fields,
        });
    }
    return {
        operation: "migrate-task-audit-index",
        target: target.projectRoot,
        result: failures.length ? "blocked" : "planned",
        summary: {
            tasks: listTaskPlanPaths(target).length,
            actions: actions.length,
            failures: failures.length,
            legacyAuditBlocks: actions.reduce((sum, action) => sum + action.legacyBlocks.length, 0) + failures.length,
        },
        actions,
        failures,
    };
}
export function applyTaskAuditIndexMigration(targetInput) {
    const target = normalizeTarget(targetInput);
    const plan = planTaskAuditIndexMigration(targetInput);
    if (plan.failures.length) {
        const error = new Error(`Task audit INDEX migration failed during plan: ${plan.failures.map((failure) => `${failure.taskId}: ${failure.failure}`).join("; ")}`);
        error.plan = plan;
        throw error;
    }
    const writes = [];
    for (const action of plan.actions) {
        const taskDir = path.join(target.projectRoot, action.path.replace(/^TARGET:/, ""));
        const indexPath = path.join(taskDir, "INDEX.md");
        const briefPath = path.join(taskDir, "brief.md");
        const reviewPath = path.join(taskDir, "review.md");
        const indexContent = readFileSafe(indexPath);
        const briefContent = readFileSafe(briefPath);
        const reviewContent = readFileSafe(reviewPath);
        writes.push({
            indexPath,
            briefPath,
            reviewPath,
            before: { indexContent, briefContent, reviewContent },
            indexContent: replaceTaskAuditMetadata(indexContent, action.fields).replace(/\n?$/, "\n"),
            briefContent: stripLegacyAuditBlocks(briefContent).replace(/\n?$/, "\n"),
            reviewContent: stripLegacyAuditBlocks(reviewContent).replace(/\n?$/, "\n"),
        });
    }
    try {
        for (const write of writes) {
            fs.writeFileSync(write.indexPath, write.indexContent);
            fs.writeFileSync(write.briefPath, write.briefContent);
            fs.writeFileSync(write.reviewPath, write.reviewContent);
        }
        verifyAppliedWrites(writes);
    }
    catch (cause) {
        for (const write of writes) {
            fs.writeFileSync(write.indexPath, write.before.indexContent);
            fs.writeFileSync(write.briefPath, write.before.briefContent);
            fs.writeFileSync(write.reviewPath, write.before.reviewContent);
        }
        const error = new Error(`Task audit INDEX migration apply failed and was rolled back: ${cause.message}`);
        error.cause = cause;
        error.plan = plan;
        throw error;
    }
    return { ...plan, result: "applied" };
}
function verifyAppliedWrites(writes) {
    for (const write of writes) {
        const audit = parseTaskAuditMetadata(readFileSafe(write.indexPath), { required: true });
        if (audit.issues.length)
            throw new Error(`${write.indexPath}: ${audit.issues.map((issue) => issue.message).join("; ")}`);
        if (scaffoldProvenanceHeadingPattern.test(readFileSafe(write.briefPath)))
            throw new Error(`${write.briefPath}: legacy Scaffold Provenance remains`);
        if (humanReviewConfirmationHeadingPattern.test(readFileSafe(write.reviewPath)))
            throw new Error(`${write.reviewPath}: legacy Human Review Confirmation remains`);
    }
}
function parseLegacyAudit({ taskId, indexContent, scaffoldBlock, reviewBlock }) {
    const audit = parseTaskAuditMetadata(indexContent);
    const fields = {};
    for (const field of taskAuditFieldOrder)
        fields[field] = audit.fields.get(field.toLowerCase()) || "n/a";
    const failures = [];
    const extraEntries = [];
    applyHistoricalBackfillDefaults(fields, taskId);
    normalizeExistingAuditFields(fields, taskId, extraEntries);
    if (scaffoldBlock) {
        const scaffold = fieldsFromMarkdownBlock(scaffoldBlock.body);
        for (const [legacyKey, canonical] of scaffoldFieldMap) {
            const value = scaffold.get(legacyKey);
            if (isConcreteAuditField(value))
                fields[canonical] = value;
        }
        for (const field of requiredScaffold) {
            if (!isConcreteAuditField(fields[field]))
                failures.push(`Scaffold Provenance missing ${field}`);
        }
        for (const [key, value] of scaffold) {
            if (!scaffoldFieldMap.has(key) && isConcreteAuditField(value))
                extraEntries.push([titleField(key), value]);
        }
    }
    if (reviewBlock) {
        const { fields: review, shape: reviewShape } = parseLegacyReviewFields(reviewBlock.body);
        const concreteConfirmation = concreteReviewConfirmationValues(review);
        if (concreteConfirmation.length === 0) {
            fields["Human Review Status"] = "not-confirmed";
            fields["Migration Status"] = "migrated";
            fields["Migration Notes"] = "removed placeholder-only legacy Human Review Confirmation";
        }
        else {
            for (const [legacyKey, canonical] of reviewFieldMap) {
                const value = review.get(legacyKey);
                if (isConcreteAuditField(value))
                    fields[canonical] = value;
            }
            const legacyTaskKey = review.get("task key") || "";
            if (isConcreteAuditField(legacyTaskKey) && legacyTaskKey !== taskId && !taskId.endsWith(`/${legacyTaskKey}`))
                failures.push(`Human Review Confirmation Task Key mismatch: ${legacyTaskKey}`);
            if (reviewShape === "field-value") {
                for (const field of requiredReview) {
                    if (!isConcreteAuditField(fields[field]))
                        failures.push(`Human Review Confirmation missing ${field}`);
                }
                if (isConcreteAuditField(fields["Audit Status"]) && String(fields["Audit Status"]).trim().toLowerCase() !== "committed")
                    failures.push(`Human Review Confirmation invalid Audit Status: ${fields["Audit Status"]}`);
            }
            else {
                for (const field of ["Confirmed At", "Reviewer"]) {
                    if (!isConcreteAuditField(fields[field]))
                        failures.push(`Human Review Confirmation missing ${field}`);
                }
                for (const field of requiredReview) {
                    if (!isConcreteAuditField(fields[field])) {
                        fields[field] = "legacy-unavailable";
                        extraEntries.push([`Missing ${field}`, "legacy-unavailable"]);
                    }
                }
                fields["Audit Status"] = "committed";
            }
            if (reviewShape === "field-value" && isConcreteAuditField(fields["Review Commit SHA"]) && !/^[0-9a-f]{7,40}$/i.test(fields["Review Commit SHA"]))
                failures.push("Human Review Confirmation invalid Review Commit SHA");
            fields["Human Review Status"] = "confirmed";
            fields["Audit Source"] = "migrated-legacy-review";
            fields["Audit Status"] = String(fields["Audit Status"] || "").toLowerCase() === "committed" ? "committed" : fields["Audit Status"];
            fields["Migration Status"] = "migrated";
            fields["Migrated From"] = "review.md#Human Review Confirmation";
            fields["Migration Notes"] = reviewShape === "field-value"
                ? "migrated legacy review confirmation; native INDEX git audit not required"
                : "migrated loose legacy review confirmation; missing native audit fields recorded as legacy-unavailable";
            for (const [key, value] of review) {
                if (!reviewFieldMap.has(key) && key !== "task key" && isConcreteAuditField(value))
                    extraEntries.push([titleField(key), value]);
            }
        }
    }
    if (extraEntries.length) {
        const mergedExtra = mergeLegacyExtraFields(fields["Legacy Extra Fields"], extraEntries);
        if (mergedExtra.failure)
            failures.push(mergedExtra.failure);
        else
            fields["Legacy Extra Fields"] = mergedExtra.json;
    }
    return { fields, failures };
}
function mergeLegacyExtraFields(existingValue, entries) {
    let merged = {};
    if (isConcreteAuditField(existingValue)) {
        try {
            merged = JSON.parse(existingValue);
            if (!merged || Array.isArray(merged) || typeof merged !== "object")
                throw new Error("not an object");
        }
        catch {
            return { failure: "Legacy Extra Fields contains invalid JSON" };
        }
    }
    const next = legacyExtraFieldsJson(entries);
    try {
        merged = { ...merged, ...JSON.parse(next) };
    }
    catch {
        return { failure: "Legacy Extra Fields migration generated invalid JSON" };
    }
    return { json: JSON.stringify(merged) };
}
function applyHistoricalBackfillDefaults(fields, taskId) {
    const createdAt = String(taskId || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "legacy-unavailable";
    const defaults = {
        "Created By": "historical-backfill",
        "Created At": createdAt,
        "Command Shape": "legacy-unavailable",
        "Budget": "legacy-unavailable",
        "Template Source": "legacy-task-index-migration",
        "Task Creator": "legacy-unavailable",
        "Task Creator Source": "legacy-unavailable",
        "Human Review Status": "not-confirmed",
        "Audit Source": "migrated-index-backfill",
        "Audit Status": "migrated",
        "Migration Status": "migrated",
    };
    for (const [field, value] of Object.entries(defaults)) {
        if (!isConcreteAuditField(fields[field]))
            fields[field] = value;
    }
}
function normalizeExistingAuditFields(fields, taskId, extraEntries) {
    const allowedCreatedBy = new Set(["harness-new-task", "manual-exception", "historical-backfill"]);
    const allowedBudget = new Set(["simple", "standard", "complex", "legacy-unavailable"]);
    const allowedCreatorSource = new Set(["git-config", "git-config-missing", "git-unavailable", "legacy-unavailable"]);
    const allowedReviewStatus = new Set(["not-confirmed", "confirmed"]);
    const allowedAuditStatus = new Set(["created", "committed", "migrated"]);
    if (!allowedCreatedBy.has(normalizeToken(fields["Created By"])))
        replacePreserving(fields, extraEntries, "Created By", "historical-backfill");
    if (normalizeToken(fields["Created At"]) !== "legacy-unavailable" && !isValidDateOnly(fields["Created At"]))
        replacePreserving(fields, extraEntries, "Created At", String(taskId || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "legacy-unavailable");
    if (!allowedBudget.has(normalizeToken(fields["Budget"])))
        replacePreserving(fields, extraEntries, "Budget", "legacy-unavailable");
    const creatorSource = normalizeToken(fields["Task Creator Source"]);
    if (!allowedCreatorSource.has(creatorSource)) {
        const normalized = /^git-config(?:-|$)/.test(creatorSource) ? "git-config" : "legacy-unavailable";
        replacePreserving(fields, extraEntries, "Task Creator Source", normalized);
    }
    if (!allowedReviewStatus.has(normalizeToken(fields["Human Review Status"])))
        replacePreserving(fields, extraEntries, "Human Review Status", "not-confirmed");
    if (!allowedAuditStatus.has(normalizeToken(fields["Audit Status"]))) {
        const replacement = normalizeToken(fields["Human Review Status"]) === "confirmed"
            ? "committed"
            : normalizeToken(fields["Audit Source"]) === "native-index"
                ? "created"
                : "migrated";
        replacePreserving(fields, extraEntries, "Audit Status", replacement);
    }
}
function replacePreserving(fields, extraEntries, field, replacement) {
    if (isConcreteAuditField(fields[field]))
        extraEntries.push([`Original ${field}`, fields[field]]);
    fields[field] = replacement;
}
function parseLegacyReviewFields(body) {
    const fields = fieldsFromMarkdownBlock(body);
    const rows = markdownTableRows(body);
    let shape = hasFieldValueTable(rows) ? "field-value" : "loose";
    for (const row of rows.slice(1).filter((candidate) => !candidate.every((cell) => /^:?-{3,}:?$/.test(cell)))) {
        const header = rows[0] || [];
        const confirmedAtIndex = firstColumn(header, ["Confirmed At"]);
        const reviewerIndex = firstColumn(header, ["Reviewer"]);
        const messageIndex = firstColumn(header, ["Message"]);
        const evidenceIndex = firstColumn(header, ["Evidence", "Evidence Checked"]);
        if (confirmedAtIndex >= 0 && row[confirmedAtIndex])
            fields.set("confirmed at", row[confirmedAtIndex]);
        if (reviewerIndex >= 0 && row[reviewerIndex])
            fields.set("reviewer", row[reviewerIndex]);
        if (messageIndex >= 0 && row[messageIndex])
            fields.set("message", row[messageIndex]);
        if (evidenceIndex >= 0 && row[evidenceIndex])
            fields.set("evidence checked", row[evidenceIndex]);
    }
    if (!rows.length && /^\s*[-*]\s*[^:：|]+?\s*[:：]/m.test(String(body || "")))
        shape = "loose";
    return { fields, shape };
}
function hasFieldValueTable(rows) {
    const header = rows[0] || [];
    return firstColumn(header, ["Field", "字段"]) >= 0 && firstColumn(header, ["Value", "值"]) >= 0;
}
function concreteReviewConfirmationValues(fields) {
    const confirmationKeys = [
        "confirmation id",
        "confirmed at",
        "reviewer",
        "reviewer email",
        "confirm text",
        "evidence",
        "evidence checked",
        "commit sha",
        "review commit sha",
    ];
    return confirmationKeys.map((key) => fields.get(key)).filter(isConcreteAuditField);
}
function titleField(value) {
    return String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(" ");
}
function normalizeToken(value) {
    return String(value || "").replace(/`/g, "").trim().toLowerCase().replaceAll("_", "-").replace(/\s+/g, "-");
}
function isValidDateOnly(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match)
        return false;
    const date = new Date(`${raw}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw;
}
