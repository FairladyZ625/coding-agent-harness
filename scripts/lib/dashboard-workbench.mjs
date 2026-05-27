// @ts-nocheck
// Dashboard workbench HTTP handlers stay behavior-first until workbench request/response types are modeled.
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { confirmTaskReview } from "./task-lifecycle.mjs";
import { createLessonSedimentationTask } from "./task-lesson-sedimentation.mjs";
import { normalizeTarget } from "./core-shared.mjs";
import { dashboardWatchRoots } from "./harness-paths.mjs";
import { collectTasks } from "./task-scanner.mjs";
import { writeDashboardFolder } from "./dashboard-data.mjs";
import { checkPresetPackage, installPresetPackage, listPresetPackages, seedBundledPresets, uninstallPresetPackage, } from "./preset-registry.mjs";
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
export async function serveDashboardWorkbench(outDir, targetInput, { host = "127.0.0.1", port = 0, localeOverride = "", autoRefresh = false, open = false, label = "dashboard workbench", recoverGeneratedDashboard = false } = {}) {
    if (host !== "127.0.0.1")
        throw new Error("dashboard workbench only supports --host 127.0.0.1");
    const target = normalizeTarget(targetInput);
    const outputDir = path.resolve(outDir);
    const csrfToken = crypto.randomBytes(24).toString("hex");
    const options = localeOverride ? { localeOverride } : {};
    let snapshotVersion = Date.now();
    const regenerate = () => {
        writeDashboardFolder(outputDir, targetInput, { ...options, workbenchRuntime: true, recoverGeneratedDashboard });
        snapshotVersion = Date.now();
    };
    regenerate();
    const server = http.createServer(async (request, response) => {
        try {
            const address = server.address();
            const actualPort = typeof address === "object" && address ? address.port : port;
            const origin = `http://${host}:${actualPort}`;
            const requestUrl = new URL(request.url || "/", origin);
            if (requestUrl.pathname === "/api/runtime" && request.method === "GET") {
                writeJson(response, 200, {
                    mode: "workbench",
                    csrfToken,
                    writableActions: ["review-complete", "lesson-sedimentation-task", "preset-check", "preset-install", "preset-seed", "preset-uninstall"],
                    target: target.projectRoot,
                    autoRefresh: autoRefresh === true,
                    snapshotVersion,
                });
                return;
            }
            if (requestUrl.pathname === "/api/tasks/review-complete" && request.method === "POST") {
                assertTrustedWorkbenchRequest(request, { origin, csrfToken });
                const body = await readJsonBody(request);
                const taskId = String(body.taskId || "");
                const task = collectTasks(target).find((item) => item.id === taskId);
                if (!task) {
                    writeJson(response, 404, { error: "Task not found" });
                    return;
                }
                if (!isTaskInReviewQueue(task)) {
                    writeJson(response, 409, reviewQueueRejectionPayload(task));
                    return;
                }
                if (task.reviewStatus === "confirmed") {
                    writeJson(response, 409, { error: "Review is already confirmed." });
                    return;
                }
                const result = confirmTaskReview(target.projectRoot, taskId, {
                    reviewer: body.reviewer || "Human Reviewer",
                    message: body.message || "confirmed from dashboard workbench",
                    evidence: body.evidence || "",
                    confirmText: body.confirmText || "",
                });
                regenerate();
                writeJson(response, 200, result);
                return;
            }
            if (requestUrl.pathname === "/api/tasks/lesson-sedimentation" && request.method === "POST") {
                assertTrustedWorkbenchRequest(request, { origin, csrfToken });
                const body = await readJsonBody(request);
                const taskId = String(body.taskId || "");
                const candidateId = String(body.candidateId || "");
                const task = collectTasks(target).find((item) => item.id === taskId);
                if (!task) {
                    writeJson(response, 404, { error: "Task not found" });
                    return;
                }
                if (!candidateId) {
                    writeJson(response, 400, { error: "Missing lesson candidate id" });
                    return;
                }
                const result = createLessonSedimentationTask(target.projectRoot, taskId, candidateId, {
                    title: body.title || "",
                });
                regenerate();
                writeJson(response, 200, result);
                return;
            }
            if (requestUrl.pathname === "/api/presets/check" && request.method === "POST") {
                assertTrustedWorkbenchRequest(request, { origin, csrfToken });
                const body = await readJsonBody(request);
                const id = String(body.id || "");
                if (!id) {
                    writeJson(response, 400, { error: "Missing preset id" });
                    return;
                }
                const result = checkPresetPackage(id, { targetInput: target.projectRoot });
                writeJson(response, 200, result);
                return;
            }
            if (requestUrl.pathname === "/api/presets/install" && request.method === "POST") {
                assertTrustedWorkbenchRequest(request, { origin, csrfToken });
                const body = await readJsonBody(request);
                const source = String(body.source || "");
                if (!source) {
                    writeJson(response, 400, { error: "Missing preset source" });
                    return;
                }
                if (/^https?:\/\//i.test(source)) {
                    writeJson(response, 400, { error: "Network preset sources are not supported by the dashboard workbench." });
                    return;
                }
                const scope = normalizePresetScope(body.scope);
                const result = installPresetPackage(source, { force: body.force === true, scope, targetInput: target.projectRoot });
                regenerate();
                writeJson(response, 200, { ...result, scope });
                return;
            }
            if (requestUrl.pathname === "/api/presets/seed" && request.method === "POST") {
                assertTrustedWorkbenchRequest(request, { origin, csrfToken });
                const body = await readJsonBody(request);
                const scope = normalizePresetScope(body.scope);
                const result = seedBundledPresets({ force: body.force === true, dryRun: body.dryRun === true, scope, targetInput: target.projectRoot });
                if (body.dryRun !== true)
                    regenerate();
                writeJson(response, 200, result);
                return;
            }
            if (requestUrl.pathname === "/api/presets/uninstall" && request.method === "POST") {
                assertTrustedWorkbenchRequest(request, { origin, csrfToken });
                const body = await readJsonBody(request);
                const id = String(body.id || "");
                if (!id) {
                    writeJson(response, 400, { error: "Missing preset id" });
                    return;
                }
                if (String(body.confirmText || "").trim() !== id) {
                    writeJson(response, 400, { error: "Preset uninstall requires typing the preset id." });
                    return;
                }
                const scope = normalizePresetScope(body.scope);
                const discovered = listPresetPackages({ targetInput: target.projectRoot }).find((preset) => preset.id === id);
                if (discovered?.source === "builtin") {
                    writeJson(response, 409, { error: "Builtin preset cannot be uninstalled from the dashboard workbench.", id, source: "builtin" });
                    return;
                }
                const result = uninstallPresetPackage(id, { scope, targetInput: target.projectRoot });
                regenerate();
                writeJson(response, 200, { ...result, scope });
                return;
            }
            if (request.method !== "GET" && request.method !== "HEAD") {
                writeJson(response, 405, { error: "Method not allowed" });
                return;
            }
            serveStaticFile(response, outputDir, requestUrl.pathname, request.method === "HEAD");
        }
        catch (error) {
            const status = error.status || (/CSRF|Origin|Host/.test(error.message) ? 403 : 400);
            writeJson(response, status, errorPayload(error));
        }
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(Number(port), host, resolve);
    });
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    const url = `http://${host}:${actualPort}/`;
    let watcher = null;
    if (autoRefresh)
        watcher = startPollingWatch(dashboardWatchRoots(target.harness), regenerate);
    console.log(`${label}: ${url} csrf=${csrfToken} outDir=${outputDir}`);
    if (open)
        openBrowser(url);
    const close = () => {
        if (watcher)
            clearInterval(watcher);
        server.close(() => process.exit(0));
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    await new Promise(() => { });
}
function normalizePresetScope(value) {
    const scope = String(value || "project");
    if (scope !== "project" && scope !== "user")
        throw new Error(`Invalid preset scope: ${scope}`);
    return scope;
}
function isTaskInReviewQueue(task) {
    return task?.reviewQueueState === "ready-to-confirm" && Array.isArray(task?.taskQueues) && task.taskQueues.includes("review");
}
function reviewQueueRejectionPayload(task) {
    return {
        error: "Review completion is only available for tasks in the review queue.",
        reviewQueueState: task?.reviewQueueState || "unknown",
        taskQueues: Array.isArray(task?.taskQueues) ? task.taskQueues : [],
        queueReasons: Array.isArray(task?.queueReasons) ? task.queueReasons : [],
        repairPrompt: task?.repairPrompt || "",
        reviewStatus: task?.reviewStatus || "unknown",
        taskId: task?.id || "",
    };
}
function startPollingWatch(roots, regenerate) {
    let lastMtime = latestTreeMtime(roots);
    let timer = null;
    return setInterval(() => {
        const nextMtime = latestTreeMtime(roots);
        if (nextMtime <= lastMtime)
            return;
        lastMtime = nextMtime;
        clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                regenerate();
            }
            catch (error) {
                console.error(`dashboard regeneration failed: ${error.message}`);
            }
        }, 250);
    }, 1000);
}
function latestTreeMtime(roots) {
    let latest = 0;
    const watchRoots = Array.isArray(roots) ? roots : [roots];
    const visit = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if ([".git", "node_modules", "tmp"].includes(entry.name))
                continue;
            const fullPath = path.join(dir, entry.name);
            const stat = fs.statSync(fullPath);
            latest = Math.max(latest, stat.mtimeMs);
            if (entry.isDirectory())
                visit(fullPath);
        }
    };
    for (const root of watchRoots) {
        if (fs.existsSync(root))
            visit(root);
    }
    return latest;
}
function openBrowser(url) {
    const command = process.platform === "darwin" ? "open" :
        process.platform === "win32" ? "cmd" :
            "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => { });
    child.unref();
}
function assertTrustedWorkbenchRequest(request, { origin, csrfToken }) {
    const host = request.headers.host || "";
    if (host !== origin.replace(/^http:\/\//, ""))
        throw new Error("Host mismatch");
    if (request.headers.origin !== origin)
        throw new Error("Origin mismatch");
    if (request.headers["x-harness-csrf"] !== csrfToken)
        throw new Error("CSRF token mismatch");
}
function readJsonBody(request) {
    return new Promise((resolve, reject) => {
        let raw = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 32_768) {
                reject(new Error("Request body too large"));
                request.destroy();
            }
        });
        request.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch {
                reject(new Error("Invalid JSON body"));
            }
        });
        request.on("error", reject);
    });
}
function serveStaticFile(response, outputDir, urlPath, headOnly) {
    const decoded = decodeURIComponent(urlPath);
    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    const filePath = path.resolve(outputDir, relative);
    if (!isPathInside(filePath, outputDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        writeJson(response, 404, { error: "Not found" });
        return;
    }
    response.writeHead(200, { "content-type": mimeType(filePath), "cache-control": "no-store" });
    if (!headOnly)
        response.end(fs.readFileSync(filePath));
    else
        response.end();
}
function writeJson(response, status, payload) {
    response.writeHead(status, jsonHeaders);
    response.end(`${JSON.stringify(payload)}\n`);
}
function errorPayload(error) {
    const payload = { error: error.message };
    if (error.code)
        payload.code = error.code;
    if (Array.isArray(error.recovery) && error.recovery.length > 0)
        payload.recovery = error.recovery;
    if (error.details)
        payload.details = error.details;
    return payload;
}
function mimeType(filePath) {
    if (filePath.endsWith(".html"))
        return "text/html; charset=utf-8";
    if (filePath.endsWith(".js"))
        return "text/javascript; charset=utf-8";
    if (filePath.endsWith(".css"))
        return "text/css; charset=utf-8";
    if (filePath.endsWith(".json"))
        return "application/json; charset=utf-8";
    if (filePath.endsWith(".md"))
        return "text/markdown; charset=utf-8";
    return "application/octet-stream";
}
function isPathInside(candidate, parent) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}
