// Dashboard workbench HTTP handlers stay behavior-first until workbench request/response types are modeled.

import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { isWorkbenchActionRequest, listWorkbenchWritableActionIds } from "../application/workbench/action-catalog.mjs";
import { confirmWorkbenchReviewBatch } from "../application/workbench/review-confirmation.mjs";
import { createAggregateLessonSedimentationTask } from "./task-lesson-sedimentation.mjs";
import { normalizeTarget } from "./core-shared.mjs";
import { dashboardWatchRoots } from "./harness-paths.mjs";
import { createWorkbenchReviewSubjectSource } from "../adapters/workbench/workbench-review-subject-source.mjs";
import { taskOperationFailurePayload } from "../application/task/task-operations.mjs";
import { createScannerTaskOperations } from "../adapters/cli/task-operations.mjs";
import { writeDashboardFolder } from "./dashboard-data.mjs";
import {
  checkPresetPackage,
  installPresetPackage,
  listPresetPackages,
  seedBundledPresets,
  uninstallPresetPackage,
} from "./preset-registry.mjs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";
import type { CheckTarget } from "./types/check-profiles.js";

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "connection": "close" };

type WorkbenchTarget = CheckTarget & {
  harness: ResolvedHarnessPaths;
};

type WorkbenchOptions = {
  host?: string;
  port?: number;
  localeOverride?: string;
  autoRefresh?: boolean;
  open?: boolean;
  label?: string;
  recoverGeneratedDashboard?: boolean;
  replaceExistingDashboardOutput?: boolean;
};

type WorkbenchBody = {
  taskId?: string;
  taskIds?: unknown[];
  candidateId?: string;
  selections?: unknown;
  reviewer?: string;
  message?: string;
  evidence?: string;
  confirmText?: string;
  title?: string;
  id?: string;
  source?: string;
  scope?: string;
  force?: boolean;
  dryRun?: boolean;
};

type BulkLessonSelection = {
  taskId: string;
  candidateId: string;
};

type JsonPayload = Record<string, unknown>;

export async function serveDashboardWorkbench(outDir: string, targetInput: string, { host = "127.0.0.1", port = 0, localeOverride = "", autoRefresh = false, open = false, label = "dashboard workbench", recoverGeneratedDashboard = false, replaceExistingDashboardOutput = false }: WorkbenchOptions = {}) {
  if (host !== "127.0.0.1") throw new Error("dashboard workbench only supports --host 127.0.0.1");
  const target = normalizeTarget(targetInput) as WorkbenchTarget;
  const workbenchReviewSubjects = createWorkbenchReviewSubjectSource(target);
  const taskOperations = createScannerTaskOperations(target.projectRoot);
  const outputDir = path.resolve(outDir);
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const options = localeOverride ? { localeOverride } : {};
  let snapshotVersion = Date.now();
  const regenerate = () => {
    writeDashboardFolder(outputDir, targetInput, { ...options, workbenchRuntime: true, recoverGeneratedDashboard, replaceExistingDashboardOutput });
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
          writableActions: listWorkbenchWritableActionIds(),
          target: target.projectRoot,
          autoRefresh: autoRefresh === true,
          snapshotVersion,
        });
        return;
      }

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "review-complete")) {
        assertTrustedWorkbenchRequest(request, { origin, csrfToken });
        const body = await readJsonBody(request);
        const taskId = String(body.taskId || "");
        const result = taskOperations.confirmReview({
          taskId,
          reviewer: body.reviewer || "Human Reviewer",
          message: body.message || "confirmed from dashboard workbench",
          evidence: body.evidence || "",
          confirmText: body.confirmText || "",
        });
        if (!result.success) {
          writeJson(response, result.status, taskOperationFailurePayload(result));
          return;
        }
        regenerate();
        writeJson(response, 200, result.data as JsonPayload);
        return;
      }

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "task-complete")) {
        assertTrustedWorkbenchRequest(request, { origin, csrfToken });
        const body = await readJsonBody(request);
        const taskId = String(body.taskId || "");
        const result = taskOperations.complete({
          taskId,
          message: body.message || "closed from dashboard workbench",
          evidence: body.evidence || "",
        });
        if (!result.success) {
          writeJson(response, result.status, taskOperationFailurePayload(result));
          return;
        }
        regenerate();
        writeJson(response, 200, result.data as JsonPayload);
        return;
      }

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "review-complete-bulk")) {
        assertTrustedWorkbenchRequest(request, { origin, csrfToken });
        const body = await readJsonBody(request);
        const requestedTaskIds = Array.isArray(body.taskIds) ? body.taskIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
        const taskIds = uniqueValues(requestedTaskIds);
        if (taskIds.length === 0) {
          writeJson(response, 400, { error: "No review tasks selected" });
          return;
        }
        const payload = confirmWorkbenchReviewBatch(target, workbenchReviewSubjects.listWorkbenchReviewSubjects(), taskIds, {
          reviewer: body.reviewer || "Human Reviewer",
          message: body.message || "bulk confirmed from dashboard workbench",
          evidence: body.evidence || "",
        });
        if (payload.confirmed > 0) regenerate();
        writeJson(response, payload.confirmed > 0 ? 200 : 409, payload);
        return;
      }

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "lesson-sedimentation-task")) {
        assertTrustedWorkbenchRequest(request, { origin, csrfToken });
        const body = await readJsonBody(request);
        const taskId = String(body.taskId || "");
        const candidateId = String(body.candidateId || "");
        if (!candidateId) {
          writeJson(response, 400, { error: "Missing lesson candidate id" });
          return;
        }
        const result = taskOperations.lessonSediment({
          taskId,
          candidateId,
          title: body.title || "",
        });
        if (!result.success) {
          writeJson(response, result.status, taskOperationFailurePayload(result));
          return;
        }
        regenerate();
        writeJson(response, 200, result.data as JsonPayload);
        return;
      }

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "lesson-sedimentation-bulk")) {
        assertTrustedWorkbenchRequest(request, { origin, csrfToken });
        const body = await readJsonBody(request);
        const selections = normalizeBulkLessonSelections(body.selections);
        if (selections.length === 0) {
          writeJson(response, 400, { error: "No lesson candidates selected" });
          return;
        }
        try {
          const result = createAggregateLessonSedimentationTask(target.projectRoot, selections, {
            title: body.title || "",
          });
          const results = selections.map((selection) => ({
            ...selection,
            ok: true,
            status: 200,
            followUpTask: result.followUpTask,
          }));
          writeJson(response, 200, {
            ok: true,
            created: 1,
            candidates: result.candidates.length,
            failed: 0,
            followUpTask: result.followUpTask,
            prompt: result.prompt,
            governance: result.governance,
            results,
          });
        } catch (error) {
          writeJson(response, errorStatus(error), { ok: false, created: 0, candidates: selections.length, failed: selections.length, ...errorPayload(error) });
        }
        return;
      }

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "preset-check")) {
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

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "preset-install")) {
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

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "preset-seed")) {
        assertTrustedWorkbenchRequest(request, { origin, csrfToken });
        const body = await readJsonBody(request);
        const scope = normalizePresetScope(body.scope);
        const result = seedBundledPresets({ force: body.force === true, dryRun: body.dryRun === true, scope, targetInput: target.projectRoot });
        if (body.dryRun !== true) regenerate();
        writeJson(response, 200, result);
        return;
      }

      if (isWorkbenchActionRequest(requestUrl.pathname, request.method, "preset-uninstall")) {
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
      if (request.method === "GET" && isDashboardDataRequest(requestUrl.pathname)) regenerate();
      serveStaticFile(response, outputDir, requestUrl.pathname, request.method === "HEAD");
    } catch (error) {
      const message = errorMessage(error);
      const status = errorStatus(error, /CSRF|Origin|Host/.test(message) ? 403 : 400);
      writeJson(response, status, errorPayload(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(port), host, () => resolve());
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}/`;
  let watcher = null;
  if (autoRefresh) watcher = startPollingWatch(dashboardWatchRoots(target.harness), regenerate);
  console.log(`${label}: ${url} csrf=${csrfToken} outDir=${outputDir}`);
  if (open) openBrowser(url);

  const close = () => {
    if (watcher) clearInterval(watcher);
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  await new Promise(() => {});
}

function normalizePresetScope(value: unknown): "project" | "user" {
  const scope = String(value || "project");
  if (scope !== "project" && scope !== "user") throw new Error(`Invalid preset scope: ${scope}`);
  return scope;
}

function isDashboardDataRequest(urlPath: string): boolean {
  return urlPath === "/assets/dashboard-data.js" || urlPath.startsWith("/data/");
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeBulkLessonSelections(rawSelections: unknown): BulkLessonSelection[] {
  if (!Array.isArray(rawSelections)) return [];
  const seen = new Set<string>();
  const result: BulkLessonSelection[] = [];
  for (const selection of rawSelections) {
    const taskId = String(selection?.taskId || "").trim();
    const candidateId = String(selection?.candidateId || "").trim();
    if (!taskId || !candidateId) continue;
    const key = `${taskId}\n${candidateId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ taskId, candidateId });
  }
  return result;
}

function startPollingWatch(roots: string | string[], regenerate: () => void): ReturnType<typeof setInterval> {
  let lastMtime = latestTreeMtime(roots);
  let timer: ReturnType<typeof setTimeout> | null = null;
  return setInterval(() => {
    const nextMtime = latestTreeMtime(roots);
    if (nextMtime <= lastMtime) return;
    lastMtime = nextMtime;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        regenerate();
      } catch (error) {
        console.error(`dashboard regeneration failed: ${errorMessage(error)}`);
      }
    }, 250);
  }, 1000);
}

function latestTreeMtime(roots: string | string[]): number {
  let latest = 0;
  const watchRoots = Array.isArray(roots) ? roots : [roots];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "tmp"].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      latest = Math.max(latest, stat.mtimeMs);
      if (entry.isDirectory()) visit(fullPath);
    }
  };
  for (const root of watchRoots) {
    if (fs.existsSync(root)) visit(root);
  }
  return latest;
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "cmd" :
    "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

function assertTrustedWorkbenchRequest(request: IncomingMessage, { origin, csrfToken }: { origin: string; csrfToken: string }): void {
  const host = request.headers.host || "";
  if (host !== origin.replace(/^http:\/\//, "")) throw new Error("Host mismatch");
  if (request.headers.origin !== origin) throw new Error("Origin mismatch");
  if (request.headers["x-harness-csrf"] !== csrfToken) throw new Error("CSRF token mismatch");
}

function readJsonBody(request: IncomingMessage): Promise<WorkbenchBody> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      raw += chunk;
      if (raw.length > 32_768) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) as WorkbenchBody : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function serveStaticFile(response: ServerResponse, outputDir: string, urlPath: string, headOnly: boolean): void {
  const decoded = decodeURIComponent(urlPath);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = path.resolve(outputDir, relative);
  if (!isPathInside(filePath, outputDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    writeJson(response, 404, { error: "Not found" });
    return;
  }
  response.writeHead(200, { "content-type": mimeType(filePath), "cache-control": "no-store" });
  if (!headOnly) response.end(fs.readFileSync(filePath));
  else response.end();
}

function writeJson(response: ServerResponse, status: number, payload: JsonPayload): void {
  response.writeHead(status, jsonHeaders);
  response.end(`${JSON.stringify(payload)}\n`);
}

function errorPayload(error: unknown): JsonPayload {
  const source = isRecord(error) ? error : {};
  const payload: JsonPayload = { error: errorMessage(error) };
  if (source.code) payload.code = source.code;
  if (Array.isArray(source.recovery) && source.recovery.length > 0) payload.recovery = source.recovery;
  if (source.details) payload.details = source.details;
  return payload;
}

function errorStatus(error: unknown, fallback = 400): number {
  const source = isRecord(error) ? error : {};
  return typeof source.status === "number" ? source.status : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mimeType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
