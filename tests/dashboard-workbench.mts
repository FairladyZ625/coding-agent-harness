#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { listWorkbenchActions, listWorkbenchWritableActionIds, workbenchActionPath } from "../scripts/application/workbench/action-catalog.mjs";
import {
  assert,
  cli,
  humanControlledTestEnv,
  node,
  repoRoot,
  tmpRoot,
  waitForWorkbench,
  writeZipFromDirectory,
} from "./helpers/harness-test-utils.mjs";

type JsonPayload = Record<string, unknown>;
type PresetApiBody = JsonPayload & {
  id?: string;
  status?: string;
  error?: string;
  operation?: string;
  scope?: string;
  failed?: number;
  results?: Array<{ status?: number; payload?: JsonPayload; error?: string }>;
};
type PresetApiResponse = {
  status: number;
  body: PresetApiBody;
  text: string;
};
type PresetPackageOptions = {
  id: string;
  purpose: string;
  kind: string;
};
type RawPostResult = {
  status: number | undefined;
  text: string;
};

const target = path.join(tmpRoot, "preset-workbench-target");
const home = path.join(tmpRoot, "preset-workbench-home");
const outDir = path.join(tmpRoot, "preset-workbench-dashboard");
const projectPresetSource = path.join(tmpRoot, "project-workbench-preset-source");
const userPresetSource = path.join(tmpRoot, "user-workbench-preset-source");
const archivePresetSource = path.join(tmpRoot, "archive-workbench-preset-source");
const archivePresetZip = path.join(tmpRoot, "archive-workbench-preset.zip");

fs.cpSync(path.join(repoRoot, "examples/minimal-project"), target, { recursive: true });
writePresetPackage(projectPresetSource, {
  id: "project-workbench",
  purpose: "Project workbench preset",
  kind: "project-workbench-task",
});
writePresetPackage(userPresetSource, {
  id: "user-workbench",
  purpose: "User workbench preset",
  kind: "user-workbench-task",
});
writePresetPackage(archivePresetSource, {
  id: "archive-workbench",
  purpose: "Archive workbench preset",
  kind: "archive-workbench-task",
});
writeZipFromDirectory(archivePresetSource, archivePresetZip, { rootName: "archive-workbench" });

const workbench = spawn(node, [cli, "dashboard", "--workbench", "--out-dir", outDir, "--host", "127.0.0.1", "--port", "0", target], {
  cwd: repoRoot,
  env: {
    ...humanControlledTestEnv({ HOME: home }),
    CODEX_THREAD_ID: "agent-hosted-workbench",
    CLAUDE_CODE_SSE_PORT: "12345",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const runtime = await waitForWorkbench(workbench);
const origin = runtime.url.replace(/\/$/, "");

try {
  const runtimePayload = await (await fetch(new URL("api/runtime", runtime.url))).json() as { writableActions: string[] };
  assert(JSON.stringify(runtimePayload.writableActions) === JSON.stringify(listWorkbenchWritableActionIds()), "workbench runtime should expose writable actions from the application action catalog");
  assert(listWorkbenchActions().every((action) => action.method === "POST" && action.path.startsWith("/api/")), "workbench action catalog should own HTTP method/path policy");
  assert(workbenchActionPath("preset-check") === "/api/presets/check", "workbench action catalog should expose preset-check route policy");
  for (const action of ["preset-check", "preset-install", "preset-seed", "preset-uninstall"]) {
    assert(runtimePayload.writableActions.includes(action), `workbench runtime should expose ${action}`);
  }
  const appScript = await (await fetch(new URL("assets/app.js", runtime.url))).text();
  assert(appScript.includes("refreshDashboardSnapshot"), "workbench app should hot-update dashboard data without a full page reload");
  assert(!appScript.includes("window.location.reload()"), "workbench app should not hard reload when snapshots change");

  const blockedBulkReview = await postJson("api/tasks/review-complete-bulk", { taskIds: ["demo-task"] });
  assert(blockedBulkReview.status === 409, `bulk review should preserve blocked review status, got ${blockedBulkReview.status}: ${blockedBulkReview.text}`);
  assert(blockedBulkReview.body.failed === 1, "bulk review should report one failed task when the task is not review-confirmable");
  assert(blockedBulkReview.body.results?.[0]?.status === 409, "bulk review should return per-task review gate status");
  assert(blockedBulkReview.body.results?.[0]?.payload?.taskId === "TASKS/demo-task", "bulk review should preserve canonical task id in blocked payload");
  assert(Array.isArray(blockedBulkReview.body.results?.[0]?.payload?.taskQueues), "bulk review should preserve queue payload for dashboard no-data-loss");

  const checkPayload = await postJson("api/presets/check", { id: "module" });
  assert(checkPayload.status === 200, `preset check should pass, got ${checkPayload.status}: ${checkPayload.text}`);
  assert(checkPayload.body.status === "pass" && checkPayload.body.id === "module", "preset check should return the preset check report");

  const builtinUninstall = await postJson("api/presets/uninstall", { id: "module", scope: "project", confirmText: "module" });
  assert(builtinUninstall.status === 409, `builtin uninstall should be rejected, got ${builtinUninstall.status}: ${builtinUninstall.text}`);
  assert(String(builtinUninstall.body.error).includes("Builtin preset cannot be uninstalled"), "builtin uninstall error should explain immutable builtin source");

  const missingCsrf = await fetch(new URL("api/presets/check", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ id: "module" }),
  });
  assert(missingCsrf.status === 403, "preset endpoints should reject missing CSRF");
  const badOrigin = await fetch(new URL("api/presets/check", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: "http://evil.example" },
    body: JSON.stringify({ id: "module" }),
  });
  assert(badOrigin.status === 403, "preset endpoints should reject untrusted origins");
  const badHost = await rawPost("api/presets/check", { id: "module" }, {
    "content-type": "application/json",
    "x-harness-csrf": runtime.csrf,
    origin,
    host: "127.0.0.1:1",
  });
  assert(badHost.status === 403, "preset endpoints should reject host mismatches");

  const networkInstall = await postJson("api/presets/install", { source: "https://example.com/preset", scope: "project" });
  assert(networkInstall.status === 400, "preset install should reject network sources");
  const invalidScope = await postJson("api/presets/seed", { scope: "global" });
  assert(invalidScope.status === 400, "preset endpoints should reject invalid scopes");

  const projectInstall = await postJson("api/presets/install", { source: projectPresetSource, scope: "project", force: true });
  assert(projectInstall.status === 200, `project install should pass, got ${projectInstall.status}: ${projectInstall.text}`);
  assert(fs.existsSync(path.join(target, ".coding-agent-harness/presets/project-workbench/preset.yaml")), "project install should write target project preset");

  const userInstall = await postJson("api/presets/install", { source: userPresetSource, scope: "user", force: true });
  assert(userInstall.status === 200, `user install should pass, got ${userInstall.status}: ${userInstall.text}`);
  assert(fs.existsSync(path.join(home, ".coding-agent-harness/presets/user-workbench/preset.yaml")), "user install should write user preset under isolated HOME");
  const archiveInstall = await postJson("api/presets/install", { source: archivePresetZip, scope: "project", force: true });
  assert(archiveInstall.status === 200, `archive install should pass, got ${archiveInstall.status}: ${archiveInstall.text}`);
  assert(fs.existsSync(path.join(target, ".coding-agent-harness/presets/archive-workbench/preset.yaml")), "archive install should write target project preset");

  const seedProject = await postJson("api/presets/seed", { scope: "project" });
  assert(seedProject.status === 200, `project seed should pass, got ${seedProject.status}: ${seedProject.text}`);
  assert(seedProject.body.operation === "preset-seed" && seedProject.body.scope === "project", "project seed should return seed operation details");
  const confirmMismatch = await postJson("api/presets/uninstall", { id: "project-workbench", scope: "project", confirmText: "wrong-id" });
  assert(confirmMismatch.status === 400, "preset uninstall should reject mismatched confirmation text");

  const projectUninstall = await postJson("api/presets/uninstall", { id: "project-workbench", scope: "project", confirmText: "project-workbench" });
  assert(projectUninstall.status === 200, `project uninstall should pass, got ${projectUninstall.status}: ${projectUninstall.text}`);
  assert(!fs.existsSync(path.join(target, ".coding-agent-harness/presets/project-workbench")), "project uninstall should remove target project preset");

  const userUninstall = await postJson("api/presets/uninstall", { id: "user-workbench", scope: "user", confirmText: "user-workbench" });
  assert(userUninstall.status === 200, `user uninstall should pass, got ${userUninstall.status}: ${userUninstall.text}`);
  assert(!fs.existsSync(path.join(home, ".coding-agent-harness/presets/user-workbench")), "user uninstall should remove user preset");
} finally {
  workbench.kill("SIGTERM");
}

console.log("Dashboard workbench preset API tests passed");

async function postJson(relativePath: string, body: JsonPayload): Promise<PresetApiResponse> {
  const response = await fetch(new URL(relativePath, runtime.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-harness-csrf": runtime.csrf,
      origin,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: PresetApiBody = {};
  try {
    parsed = text ? JSON.parse(text) as PresetApiBody : {};
  } catch {}
  return { status: response.status, body: parsed, text };
}

function rawPost(relativePath: string, body: JsonPayload, headers: IncomingHttpHeaders): Promise<RawPostResult> {
  const url = new URL(relativePath, runtime.url);
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: {
        "content-length": Buffer.byteLength(payload),
        ...headers,
      },
    }, (response: IncomingMessage) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, text }));
    });
    request.on("error", reject);
    request.end(payload);
  });
}

function writePresetPackage(directory: string, { id, purpose, kind }: PresetPackageOptions): void {
  fs.mkdirSync(path.join(directory, "templates"), { recursive: true });
  fs.writeFileSync(path.join(directory, "templates/task_plan.append.md"), `## ${id}\n\nPreset: {{title}}\n`);
  fs.writeFileSync(
    path.join(directory, "preset.yaml"),
    `id: ${id}
version: 1
purpose: ${purpose}
compatibleBudgets: [standard, complex]
localeSupport: [en-US, zh-CN]
task:
  kind: ${kind}
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
templateValues:
  title:
    from: task.title
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`,
  );
}
