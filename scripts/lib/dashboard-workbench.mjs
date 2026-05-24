import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { confirmTaskReview } from "./task-lifecycle.mjs";
import { createLessonSedimentationTask } from "./task-lesson-sedimentation.mjs";
import { normalizeTarget } from "./core-shared.mjs";
import { collectTasks } from "./task-scanner.mjs";
import { writeDashboardFolder } from "./dashboard-data.mjs";

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export async function serveDashboardWorkbench(outDir, targetInput, { host = "127.0.0.1", port = 0, localeOverride = "", autoRefresh = false, open = false, label = "dashboard workbench" } = {}) {
  if (host !== "127.0.0.1") throw new Error("dashboard workbench only supports --host 127.0.0.1");
  const target = normalizeTarget(targetInput);
  const outputDir = path.resolve(outDir);
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const options = localeOverride ? { localeOverride } : {};
  let snapshotVersion = Date.now();
  const regenerate = () => {
    writeDashboardFolder(outputDir, targetInput, { ...options, workbenchRuntime: true });
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
          writableActions: ["review-complete", "lesson-sedimentation-task"],
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
          writeJson(response, 409, { error: "Review completion is only available for tasks in the review queue." });
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

      if (request.method !== "GET" && request.method !== "HEAD") {
        writeJson(response, 405, { error: "Method not allowed" });
        return;
      }
      serveStaticFile(response, outputDir, requestUrl.pathname, request.method === "HEAD");
    } catch (error) {
      const status = /CSRF|Origin|Host/.test(error.message) ? 403 : 400;
      writeJson(response, status, { error: error.message });
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
  if (autoRefresh) watcher = startPollingWatch(target.docsRoot, regenerate);
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

function isTaskInReviewQueue(task) {
  return task?.reviewQueueState === "ready-to-confirm" && Array.isArray(task?.taskQueues) && task.taskQueues.includes("review");
}

function startPollingWatch(root, regenerate) {
  let lastMtime = latestTreeMtime(root);
  let timer = null;
  return setInterval(() => {
    const nextMtime = latestTreeMtime(root);
    if (nextMtime <= lastMtime) return;
    lastMtime = nextMtime;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        regenerate();
      } catch (error) {
        console.error(`dashboard regeneration failed: ${error.message}`);
      }
    }, 250);
  }, 1000);
}

function latestTreeMtime(root) {
  let latest = 0;
  if (!fs.existsSync(root)) return latest;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "tmp"].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      latest = Math.max(latest, stat.mtimeMs);
      if (entry.isDirectory()) visit(fullPath);
    }
  };
  visit(root);
  return latest;
}

function openBrowser(url) {
  const command =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "cmd" :
    "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

function assertTrustedWorkbenchRequest(request, { origin, csrfToken }) {
  const host = request.headers.host || "";
  if (host !== origin.replace(/^http:\/\//, "")) throw new Error("Host mismatch");
  if (request.headers.origin !== origin) throw new Error("Origin mismatch");
  if (request.headers["x-harness-csrf"] !== csrfToken) throw new Error("CSRF token mismatch");
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
      } catch {
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
  if (!headOnly) response.end(fs.readFileSync(filePath));
  else response.end();
}

function writeJson(response, status, payload) {
  response.writeHead(status, jsonHeaders);
  response.end(`${JSON.stringify(payload)}\n`);
}

function mimeType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function isPathInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
