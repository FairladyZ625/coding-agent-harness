// @ts-nocheck
import path from "node:path";
import { localizedTemplateSource, todayDate } from "../core-shared.mjs";
import { markdownCell } from "./text-utils.mjs";
function shellArg(value) {
    const text = String(value || "");
    if (/^[A-Za-z0-9._/:=@+-]+$/.test(text))
        return text;
    return `'${text.replaceAll("'", "'\\''")}'`;
}
function commandPathArg(value, fallback) {
    const text = String(value || fallback || ".").trim() || ".";
    if (text === ".")
        return ".";
    return path.isAbsolute(text) ? fallback : text;
}
function renderNewTaskCommand({ taskId, title, locale, budget, longRunning, moduleKey, preset, fromSession, targetInput }) {
    const parts = ["harness", "new-task"];
    if (taskId)
        parts.push(taskId);
    parts.push("--budget", budget, "--locale", locale);
    if (title)
        parts.push("--title", title);
    if (moduleKey)
        parts.push("--module", moduleKey);
    if (preset && preset !== "none")
        parts.push("--preset", preset);
    if (fromSession)
        parts.push("--from-session", commandPathArg(fromSession, "<session.json>"));
    if (longRunning)
        parts.push("--long-running");
    parts.push(commandPathArg(targetInput, "<target>"));
    return parts.map(shellArg).join(" ");
}
export function buildScaffoldProvenance({ taskId, normalizedTaskId, title, locale, budget, longRunning, moduleKey, preset, fromSession, targetInput, automaticTaskId = false }) {
    return {
        createdBy: "harness new-task",
        command: markdownCell(renderNewTaskCommand({
            taskId: automaticTaskId ? "" : taskId || normalizedTaskId,
            title,
            locale,
            budget,
            longRunning,
            moduleKey,
            preset,
            fromSession,
            targetInput,
        })),
        createdAt: todayDate(),
        budget,
        templateSource: localizedTemplateSource("templates/planning/brief.md", locale),
        exceptionReason: "n/a",
    };
}
