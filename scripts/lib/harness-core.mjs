import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const legacyChecker = path.join(repoRoot, "scripts/check-harness.mjs");

export const capabilityDefinitions = {
  core: {
    description: "Planning loop and task execution records.",
    dependencies: [],
    artifacts: ["docs/09-PLANNING"],
  },
  "module-parallel": {
    description: "Module registry, module plans, session prompts, and worker handoff.",
    dependencies: ["core"],
    artifacts: ["docs/09-PLANNING/Module-Registry.md", "docs/09-PLANNING/MODULES"],
  },
  "review-contract": {
    description: "Machine-gateable review reports and verifier output contract.",
    dependencies: ["core"],
    artifacts: ["docs/09-PLANNING/TASKS"],
  },
  "dashboard": {
    description: "Read-only HTML dashboard generated from harness status JSON.",
    dependencies: ["core"],
    artifacts: [],
  },
  "safe-adoption": {
    description: "Legacy compatibility and assisted capability adoption.",
    dependencies: ["core"],
    artifacts: [],
  },
};

export const allowedCapabilityStates = new Set(["scaffolded", "configured", "verified"]);
export const allowedReviewDispositions = new Set([
  "open",
  "mitigated",
  "closed",
  "deferred",
  "accepted-risk",
  "not-reproducible",
  "out-of-scope",
]);
export const allowedPhaseStates = new Set(["planned", "in_progress", "review", "blocked", "done", "skipped"]);
export const allowedEvidenceStatus = new Set(["missing", "partial", "present", "waived"]);

export function normalizeTarget(input = ".") {
  const target = path.resolve(input);
  const isDocsRoot =
    path.basename(target) === "docs" &&
    (fs.existsSync(path.join(target, "09-PLANNING")) || fs.existsSync(path.join(target, "11-REFERENCE")));
  return {
    input: target,
    projectRoot: isDocsRoot ? path.dirname(target) : target,
    docsRoot: isDocsRoot ? target : path.join(target, "docs"),
    docsOnly: isDocsRoot,
  };
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function exists(target, relativePath) {
  return fs.existsSync(path.join(target.projectRoot, relativePath));
}

export function existsInDocs(target, relativePath) {
  return fs.existsSync(path.join(target.docsRoot, relativePath));
}

export function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function walkFiles(root) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if ([".git", "node_modules", "tmp"].includes(entry)) continue;
        walk(full);
      } else {
        results.push(full);
      }
    }
  }
  walk(root);
  return results;
}

export function readCapabilityRegistry(target) {
  const registryPath = path.join(target.projectRoot, ".harness-capabilities.json");
  if (!fs.existsSync(registryPath)) {
    return {
      mode: "legacy-compat",
      path: registryPath,
      capabilities: [{ name: "core", state: "configured" }],
      raw: null,
      errors: [],
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities.map((entry) =>
          typeof entry === "string"
            ? { name: entry, state: "scaffolded" }
            : { name: entry.name, state: entry.state || "scaffolded" },
        )
      : [];
    return { mode: "declared-capability", path: registryPath, capabilities, raw, errors: [] };
  } catch (error) {
    return { mode: "declared-capability", path: registryPath, capabilities: [], raw: null, errors: [error.message] };
  }
}

export function detectCapabilities(target) {
  const detected = new Set(["core"]);
  if (existsInDocs(target, "09-PLANNING/Module-Registry.md")) detected.add("module-parallel");
  if (existsInDocs(target, "09-PLANNING/TASKS") || existsInDocs(target, "09-PLANNING/MODULES")) detected.add("review-contract");
  if (existsInDocs(target, "01-GOVERNANCE/Lessons-SSoT.md")) detected.add("safe-adoption");
  return [...detected];
}

export function validateCapabilities(target) {
  const registry = readCapabilityRegistry(target);
  const detected = detectCapabilities(target);
  const failures = [];
  const warnings = [];
  const byName = new Map(registry.capabilities.map((capability) => [capability.name, capability]));

  for (const error of registry.errors) failures.push(`invalid .harness-capabilities.json: ${error}`);
  for (const capability of registry.capabilities) {
    if (!capabilityDefinitions[capability.name]) {
      failures.push(`unknown capability: ${capability.name}`);
      continue;
    }
    if (!allowedCapabilityStates.has(capability.state)) {
      failures.push(`capability ${capability.name} has invalid state: ${capability.state}`);
    }
    for (const dependency of capabilityDefinitions[capability.name].dependencies) {
      if (!byName.has(dependency)) failures.push(`capability ${capability.name} missing dependency: ${dependency}`);
    }
    if (registry.mode === "declared-capability") {
      for (const artifact of capabilityDefinitions[capability.name].artifacts) {
        if (!exists(target, artifact)) {
          failures.push(`capability ${capability.name} missing required artifact: ${artifact}`);
        }
      }
    }
  }

  if (registry.mode === "declared-capability") {
    for (const capability of detected) {
      if (!byName.has(capability)) warnings.push(`orphan capability artifact detected without declaration: ${capability}`);
    }
  } else {
    warnings.push("legacy-compat mode: no .harness-capabilities.json; adoption suggestion is available");
  }

  return { registry, detected, failures, warnings };
}

function markdownTableRows(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function tableAfterHeading(content, headerPattern) {
  const rows = markdownTableRows(content);
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => headerPattern.test(cell)));
  if (headerIndex < 0) return { header: [], rows: [] };
  const header = rows[headerIndex];
  const body = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (row.length !== header.length) break;
    body.push(row);
  }
  return { header, rows: body };
}

function getColumn(header, name) {
  return header.findIndex((cell) => cell.toLowerCase() === name.toLowerCase());
}

function parseTaskState(progressContent) {
  const match = progressContent.match(/^##\s*(?:Status|状态)\s*[:：]?\s*(?:\n\s*)?([^\n]+)/im);
  const raw = match ? match[1].replace(/`/g, "").trim() : "unknown";
  const aliases = new Map([
    ["进行中", "in_progress"],
    ["已完成", "completed"],
    ["未开始", "not_started"],
    ["已阻塞", "blocked"],
  ]);
  return aliases.get(raw) || raw.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function parsePhases(taskPlanContent) {
  const { header, rows } = tableAfterHeading(taskPlanContent, /^Phase ID$/i);
  if (rows.length === 0) return [];
  const indexes = {
    id: getColumn(header, "Phase ID"),
    dependsOn: getColumn(header, "Depends On"),
    state: getColumn(header, "State"),
    completion: getColumn(header, "Completion"),
    output: getColumn(header, "Output"),
    requiredEvidence: getColumn(header, "Required Evidence"),
    evidenceStatus: getColumn(header, "Evidence Status"),
    blockingRisk: getColumn(header, "Blocking Risk"),
    owner: getColumn(header, "Owner / Handoff"),
  };
  return rows.map((row) => ({
    id: row[indexes.id] || "",
    dependsOn: (row[indexes.dependsOn] || "").split(",").map((item) => item.trim()).filter(Boolean).filter((item) => item !== "none"),
    state: row[indexes.state] || "planned",
    completion: Number.parseInt(String(row[indexes.completion] || "0").replace("%", ""), 10) || 0,
    output: row[indexes.output] || "",
    requiredEvidence: splitList(row[indexes.requiredEvidence] || ""),
    evidenceStatus: row[indexes.evidenceStatus] || "missing",
    blockingRisk: row[indexes.blockingRisk] || "",
    owner: row[indexes.owner] || "",
  }));
}

function splitList(value) {
  return String(value || "")
    .split(/[,+;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.toLowerCase() !== "none");
}

function listTaskPlanPaths(target) {
  const taskRoots = [
    path.join(target.docsRoot, "09-PLANNING/TASKS"),
    path.join(target.docsRoot, "09-PLANNING/MODULES"),
  ];
  return taskRoots
    .flatMap(walkFiles)
    .filter((file) => file.endsWith("task_plan.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`));
}

export function collectTasks(target) {
  return listTaskPlanPaths(target).map((taskPlanPath) => {
    const taskDir = path.dirname(taskPlanPath);
    const taskPlan = readFileSafe(taskPlanPath);
    const progress = readFileSafe(path.join(taskDir, "progress.md"));
    const review = readFileSafe(path.join(taskDir, "review.md"));
    const phases = parsePhases(taskPlan);
    const completion =
      phases.length > 0
        ? Math.round(
            phases.filter((phase) => phase.state !== "skipped").reduce((sum, phase) => sum + phase.completion, 0) /
              Math.max(1, phases.filter((phase) => phase.state !== "skipped").length),
          )
        : 0;
    const relative = toPosix(path.relative(target.projectRoot, taskDir));
    const title = path.basename(taskDir);
    return {
      id: title,
      title,
      path: `TARGET:${relative}`,
      state: parseTaskState(progress),
      completion,
      phases,
      risks: collectReviewRisks(review),
      evidence: collectEvidence(progress),
      handoffs: collectHandoffs(progress, title),
      dependencies: [],
    };
  });
}

function collectHandoffs(progressContent, taskId) {
  if (!/Coordinator Handoff/i.test(progressContent) || !/pending-coordinator-pass/i.test(progressContent)) return [];
  return [{ id: `H-${taskId}`, from: "worker", to: "coordinator", state: "pending", summary: "Coordinator handoff pending" }];
}

function collectReviewRisks(reviewContent) {
  const { header, rows } = tableAfterHeading(reviewContent, /^ID$/i);
  const severityIndex = getColumn(header, "Severity");
  const findingIndex = getColumn(header, "Finding");
  const openIndex = getColumn(header, "Open");
  const blocksIndex = getColumn(header, "Blocks Release");
  if (severityIndex < 0 || findingIndex < 0) return [];
  return rows
    .filter((row) => /^P[0-3]$/i.test(row[severityIndex] || ""))
    .map((row) => ({
      id: row[0],
      severity: row[severityIndex],
      open: /^yes$/i.test(row[openIndex] || "no"),
      blocksRelease: /^yes$/i.test(row[blocksIndex] || "no"),
      summary: row[findingIndex],
    }));
}

function collectEvidence(progressContent) {
  const matches = [...progressContent.matchAll(/\b(command|diff|fixture|screenshot|review|report):((?:PUBLIC|PRIVATE|TARGET|EXTERNAL|URL):[^:\s|]+):([^\n|]+)/g)];
  return matches.map((match, index) => ({
    id: `E-${String(index + 1).padStart(3, "0")}`,
    type: match[1],
    path: match[2],
    status: "present",
    summary: match[3].trim(),
  }));
}

export function runLegacyCheck(target) {
  const checkTarget = target.docsOnly ? target.projectRoot : target.input;
  const result = spawnSync(process.execPath, [legacyChecker, checkTarget], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status === 0 ? "pass" : "fail",
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function validateReviewSchema(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  const reviewPaths = walkFiles(target.docsRoot)
    .filter((file) => file.endsWith("review.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`));

  for (const reviewPath of reviewPaths) {
    const relative = toPosix(path.relative(target.projectRoot, reviewPath));
    const content = readFileSafe(reviewPath);
    for (const required of ["Reviewer Identity", "Confidence Challenge", "Evidence Checked", "Final Confidence Basis"]) {
      if (!content.includes(required)) {
        if (strict) failures.push(`${relative} missing ${required}`);
        else warnings.push(`${relative} missing ${required}`);
      }
    }
    const evidenceTable = tableAfterHeading(content, /^Evidence ID$/i);
    if (strict && evidenceTable.rows.length === 0) {
      failures.push(`${relative} Evidence Checked table needs at least one evidence row`);
    }
    const usesVerifier = /verifier-backed|(^|\|)[^|\n]*\|\s*verifier\s*\|/im.test(content);
    if (usesVerifier) {
      if (!/template_id:\s*`?harness-verifier\/v1`?/i.test(content)) {
        report(`${relative} verifier-backed review missing template_id: harness-verifier/v1`);
      }
      if (!/verdict:\s*`?(pass|fail|inconclusive)`?/i.test(content)) {
        report(`${relative} verifier-backed review missing verdict`);
      }
    }
    const { header, rows } = tableAfterHeading(content, /^ID$/i);
    if (rows.length === 0) continue;
    const severityIndex = getColumn(header, "Severity");
    const openIndex = getColumn(header, "Open");
    const dispositionIndex = getColumn(header, "Disposition");
    const blocksIndex = getColumn(header, "Blocks Release");
    const followUpIndex = getColumn(header, "Follow-up");
    const evidenceCheckedIndex = getColumn(header, "Evidence Checked");
    if ([severityIndex, openIndex, dispositionIndex, blocksIndex].some((index) => index < 0)) {
      report(`${relative} findings table missing Severity/Open/Disposition/Blocks Release columns`);
      continue;
    }
    for (const row of rows) {
      const id = row[0] || "";
      if (!/^(R|SR)-\d+/i.test(id)) continue;
      const severity = row[severityIndex] || "";
      const open = (row[openIndex] || "").toLowerCase();
      const disposition = (row[dispositionIndex] || "").toLowerCase();
      const blocks = (row[blocksIndex] || "").toLowerCase();
      const followUp = row[followUpIndex] || "";
      if (!/^P[0-3]$/.test(severity)) report(`${relative} ${id} invalid severity: ${severity}`);
      if (!["yes", "no"].includes(open)) report(`${relative} ${id} invalid Open value: ${open}`);
      if (!allowedReviewDispositions.has(disposition)) report(`${relative} ${id} invalid Disposition: ${disposition}`);
      if (!["yes", "no"].includes(blocks)) report(`${relative} ${id} invalid Blocks Release value: ${blocks}`);
      if ((open === "yes" || blocks === "yes") && /^P[01]$/.test(severity)) {
        report(`${relative} ${id} has release-blocking open ${severity}`);
      }
      if (["accepted-risk", "deferred"].includes(disposition) && (!followUp || /^none|无$/i.test(followUp))) {
        report(`${relative} ${id} ${disposition} requires follow-up routing`);
      }
      if (strict && evidenceCheckedIndex >= 0) {
        const refs = splitList(row[evidenceCheckedIndex] || "");
        const evidenceIds = new Set(evidenceTable.rows.map((evidenceRow) => evidenceRow[0]));
        for (const ref of refs) {
          if (ref !== "none" && /^E-\d+/i.test(ref) && !evidenceIds.has(ref)) {
            failures.push(`${relative} ${id} references missing evidence id: ${ref}`);
          }
        }
      }
    }
  }
  return { failures, warnings };
}

export function validateVisualRoadmaps(target) {
  const failures = [];
  const warnings = [];
  for (const taskPlanPath of listTaskPlanPaths(target)) {
    const relative = toPosix(path.relative(target.projectRoot, taskPlanPath));
    const taskPlan = readFileSafe(taskPlanPath);
    const { header, rows } = tableAfterHeading(taskPlan, /^Phase ID$/i);
    if (rows.length > 0) {
      for (const column of ["Phase ID", "Depends On", "State", "Completion", "Output", "Required Evidence", "Evidence Status", "Blocking Risk", "Owner / Handoff"]) {
        if (getColumn(header, column) < 0) failures.push(`${relative} Visual Roadmap missing column: ${column}`);
      }
    }
    const phases = parsePhases(taskPlan);
    for (const phase of phases) {
      if (!allowedPhaseStates.has(phase.state)) failures.push(`${relative} phase ${phase.id} invalid state: ${phase.state}`);
      if (!allowedEvidenceStatus.has(phase.evidenceStatus)) {
        failures.push(`${relative} phase ${phase.id} invalid evidence status: ${phase.evidenceStatus}`);
      }
      if (!Number.isInteger(phase.completion) || phase.completion < 0 || phase.completion > 100) {
        failures.push(`${relative} phase ${phase.id} completion must be integer 0..100`);
      }
      if (phase.state === "done" && phase.completion !== 100) failures.push(`${relative} phase ${phase.id} done must be 100`);
      if (phase.state === "planned" && phase.completion !== 0) failures.push(`${relative} phase ${phase.id} planned must be 0`);
    }
    if (phases.length === 0) warnings.push(`${relative} has no Visual Roadmap phase table`);
  }
  return { failures, warnings };
}

export function buildStatus(targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const capabilityState = validateCapabilities(target);
  const shouldRunLegacy = !options.skipLegacyCheck && capabilityState.registry.mode === "legacy-compat";
  const legacy = shouldRunLegacy ? runLegacyCheck(target) : { status: "skipped", code: 0, stdout: "", stderr: "" };
  const reviews = validateReviewSchema(target, { strict: capabilityState.registry.mode !== "legacy-compat" });
  const roadmaps = validateVisualRoadmaps(target);
  const failures = [...capabilityState.failures, ...reviews.failures, ...roadmaps.failures];
  const warnings = [...capabilityState.warnings, ...reviews.warnings, ...roadmaps.warnings];
  if (legacy.status === "fail") {
    if (options.strictLegacy) failures.push("legacy check failed");
    else warnings.push(`adoption-needed: legacy check failed: ${(legacy.stderr || legacy.stdout).trim()}`);
  }

  const tasks = collectTasks(target);
  const capabilityNames = new Map(capabilityState.registry.capabilities.map((capability) => [capability.name, capability]));
  for (const detected of capabilityState.detected) {
    if (!capabilityNames.has(detected)) capabilityNames.set(detected, { name: detected, state: "configured" });
  }

  return {
    project: {
      name: path.basename(target.projectRoot),
      root: `TARGET:${target.docsOnly ? toPosix(path.relative(target.projectRoot, target.docsRoot)) : "."}`,
      docsOnly: target.docsOnly,
    },
    generatedAt: new Date().toISOString(),
    mode: capabilityState.registry.mode,
    checkState: {
      status: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
      failures: failures.length,
      warnings: warnings.length,
      details: { failures, warnings },
      legacy,
    },
    capabilities: [...capabilityNames.values()].map((capability) => ({
      name: capability.name,
      state: capability.state || "configured",
      dependencyStatus: capabilityDefinitions[capability.name]?.dependencies.every((dependency) => capabilityNames.has(dependency))
        ? "valid"
        : "invalid",
      warnings: capabilityState.warnings.filter((warning) => warning.includes(capability.name)),
    })),
    tasks,
    handoffs: tasks.flatMap((task) => task.handoffs || []),
    recentActivity: tasks.slice(0, 8).map((task) => ({ at: new Date().toISOString(), type: "task", summary: task.title })),
  };
}

export function renderDashboard(status) {
  const taskCards = status.tasks
    .map((task) => {
      const phases = task.phases
        .map(
          (phase) => `<div class="phase ${escapeHtml(phase.state)}">
            <div class="phase-top"><strong>${escapeHtml(phase.id)}</strong><span>${phase.completion}%</span></div>
            <div class="phase-output">${escapeHtml(phase.output)}</div>
            <div class="meter"><i style="width:${phase.completion}%"></i></div>
            <div class="muted">${escapeHtml(phase.state)} · evidence ${escapeHtml(phase.evidenceStatus)}</div>
          </div>`,
        )
        .join("");
      const risks = task.risks
        .map((risk) => `<span class="risk ${risk.open || risk.blocksRelease ? "open" : ""}">${escapeHtml(risk.severity)} ${escapeHtml(risk.summary)}</span>`)
        .join("");
      const evidence = task.evidence
        .map((item) => `<span class="evidence">${escapeHtml(item.type)} · ${escapeHtml(item.summary)}</span>`)
        .join("");
      const evidenceMeter = evidenceCompletion(task.phases);
      return `<section class="task">
        <div class="task-head">
          <div><h2>${escapeHtml(task.title)}</h2><p>${escapeHtml(task.path)}</p></div>
          <div class="score">${task.completion}%</div>
        </div>
        <div class="meter"><i style="width:${task.completion}%"></i></div>
        <div class="phases">${phases || '<div class="empty">No phase table</div>'}</div>
        <div class="evidence-row"><strong>Evidence</strong><div class="meter small"><i style="width:${evidenceMeter}%"></i></div>${evidence || '<span class="empty">No evidence</span>'}</div>
        <div class="risks">${risks || '<span class="ok">No open visual risk</span>'}</div>
      </section>`;
    })
    .join("");
  const chips = status.capabilities
    .map((capability) => `<span class="chip ${escapeHtml(capability.state)}">${escapeHtml(capability.name)} · ${escapeHtml(capability.state)}</span>`)
    .join("");
  const failures = status.checkState.details.failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join("");
  const warnings = status.checkState.details.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  const handoffs = status.handoffs
    .map((handoff) => `<span class="handoff">${escapeHtml(handoff.state)} · ${escapeHtml(handoff.summary)}</span>`)
    .join("");
  const activity = status.recentActivity
    .map((item) => `<li><strong>${escapeHtml(item.type)}</strong> ${escapeHtml(item.summary)}</li>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(status.project.name)} Harness Dashboard</title>
  <style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a;background:#f6f7f9}
    body{margin:0}.shell{max-width:1180px;margin:0 auto;padding:28px}
    header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}
    h1,h2{margin:0;letter-spacing:0}h1{font-size:30px}h2{font-size:18px}p{margin:6px 0;color:#687382}
    .pill,.chip,.risk,.ok{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:12px;margin:4px;background:#e8edf3;color:#273444}
    .pass,.verified{background:#dff5e8;color:#125c32}.warn,.configured{background:#fff0cc;color:#765100}.fail,.open{background:#ffe1df;color:#8a1c12}.scaffolded{background:#e8edf3;color:#273444}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}.stat,.task{background:#fff;border:1px solid #e4e8ee;border-radius:8px;padding:16px}
    .stat strong{font-size:24px;display:block}.capabilities{margin-bottom:20px}.task{margin-bottom:16px}.task-head{display:flex;justify-content:space-between;gap:16px}
    .score{font-size:28px;font-weight:700;color:#223047}.meter{height:8px;background:#edf1f5;border-radius:99px;overflow:hidden;margin:10px 0}.meter i{display:block;height:100%;background:#2f6fed}.meter.small{height:6px;max-width:180px}
    .evidence,.handoff{display:inline-flex;padding:5px 8px;margin:4px;border-radius:6px;background:#edf7ff;color:#214d72;font-size:12px}.handoff{background:#fff3d8;color:#745000}
    .phases{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:12px}.phase{border:1px solid #e5eaf0;border-radius:8px;padding:12px;background:#fbfcfe}.phase-top{display:flex;justify-content:space-between}.phase-output{min-height:38px;margin-top:8px}
    .risks{margin-top:12px}.empty{color:#8a95a3}.panel{background:#fff;border:1px solid #e4e8ee;border-radius:8px;padding:16px;margin-top:16px}
    @media(max-width:760px){.shell{padding:16px}header{display:block}.grid{grid-template-columns:1fr 1fr}.task-head{display:block}}
  </style>
</head>
<body><main class="shell">
  <header>
    <div><h1>${escapeHtml(status.project.name)} Harness Dashboard</h1><p>${escapeHtml(status.project.root)} · ${escapeHtml(status.generatedAt)}</p></div>
    <span class="pill ${escapeHtml(status.checkState.status)}">${escapeHtml(status.checkState.status)} · ${escapeHtml(status.mode)}</span>
  </header>
  <section class="grid">
    <div class="stat"><strong>${status.tasks.length}</strong><span>Tasks</span></div>
    <div class="stat"><strong>${status.capabilities.length}</strong><span>Capabilities</span></div>
    <div class="stat"><strong>${status.checkState.failures}</strong><span>Failures</span></div>
    <div class="stat"><strong>${status.checkState.warnings}</strong><span>Warnings</span></div>
  </section>
  <section class="capabilities">${chips}</section>
  <section class="panel"><h2>Handoffs</h2>${handoffs || '<span class="ok">No pending handoff</span>'}</section>
  ${taskCards || '<section class="task">No tasks found.</section>'}
  <section class="panel"><h2>Recent Activity</h2><ul>${activity || "<li>None</li>"}</ul></section>
  <section class="panel"><h2>Failures</h2><ul>${failures || "<li>None</li>"}</ul><h2>Warnings</h2><ul>${warnings || "<li>None</li>"}</ul></section>
</main></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function evidenceCompletion(phases) {
  const scored = phases.filter((phase) => phase.state !== "skipped");
  if (scored.length === 0) return 0;
  const score = scored.reduce((sum, phase) => {
    if (["present", "waived"].includes(phase.evidenceStatus)) return sum + 100;
    if (phase.evidenceStatus === "partial") return sum + 50;
    return sum;
  }, 0);
  return Math.round(score / scored.length);
}

export function plannedInitFiles(capabilities = ["core"]) {
  const files = [
    ["AGENTS.md", "templates/AGENTS.md.template"],
    ["CLAUDE.md", "templates/CLAUDE.md.template"],
    ["docs/Harness-Ledger.md", "templates/ledger/Harness-Ledger.md"],
    ["docs/09-PLANNING/TASKS/_task-template/task_plan.md", "templates/planning/task_plan.md"],
    ["docs/09-PLANNING/TASKS/_task-template/findings.md", "templates/planning/findings.md"],
    ["docs/09-PLANNING/TASKS/_task-template/progress.md", "templates/planning/progress.md"],
    ["docs/09-PLANNING/TASKS/_task-template/review.md", "templates/planning/review.md"],
    ["docs/09-PLANNING/TASKS/_task-template/long-running-task-contract.md", "templates/planning/long-running-task-contract.md"],
    ["docs/05-TEST-QA/Regression-SSoT.md", "templates/ssot/Regression-SSoT.md"],
    ["docs/05-TEST-QA/Cadence-Ledger.md", "templates/regression/Cadence-Ledger.md"],
    ["docs/01-GOVERNANCE/Lessons-SSoT.md", "templates/ssot/Lessons-SSoT.md"],
    ["docs/10-WALKTHROUGH/_walkthrough-template.md", "templates/walkthrough/walkthrough-template.md"],
    ["docs/10-WALKTHROUGH/Closeout-SSoT.md", "templates/walkthrough/Closeout-SSoT.md"],
  ];
  for (const ref of fs.readdirSync(path.join(repoRoot, "templates/reference"))) {
    if (ref.endsWith(".md")) files.push([`docs/11-REFERENCE/${ref}`, `templates/reference/${ref}`]);
  }
  if (capabilities.includes("module-parallel")) {
    files.push(["docs/09-PLANNING/Module-Registry.md", "templates/ssot/Module-Registry.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/task_plan.md", "templates/planning/task_plan.md"]);
  }
  return files;
}

export function writeInitFiles(targetInput, capabilities, { dryRun = true } = {}) {
  const target = normalizeTarget(targetInput);
  const existingRegistry = readCapabilityRegistry(target);
  if (existingRegistry.raw) {
    const installed = new Set(existingRegistry.capabilities.map((capability) => capability.name));
    const requested = new Set(capabilities);
    const same =
      installed.size === requested.size &&
      [...installed].every((capability) => requested.has(capability));
    if (!same) {
      throw new Error("Existing capability registry differs from requested init capabilities; use add-capability instead.");
    }
  }
  const planned = plannedInitFiles(capabilities);
  const changes = [];
  for (const [destination, source] of planned) {
    const destinationPath = path.join(target.projectRoot, destination);
    const sourcePath = path.join(repoRoot, source);
    const existsAlready = fs.existsSync(destinationPath);
    changes.push({ destination, source, action: existsAlready ? "skip-existing" : dryRun ? "would-create" : "create" });
    if (!dryRun && !existsAlready) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
  const registry = {
    version: 1,
    capabilities: capabilities.map((name) => ({ name, state: "scaffolded" })),
  };
  if (!dryRun) {
    const registryPath = path.join(target.projectRoot, ".harness-capabilities.json");
    if (!fs.existsSync(registryPath)) fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  }
  return { target, capabilities, changes };
}

export function addCapability(targetInput, capabilityName, { dryRun = true } = {}) {
  const target = normalizeTarget(targetInput);
  if (!capabilityDefinitions[capabilityName]) throw new Error(`Unknown capability: ${capabilityName}`);
  const registry = readCapabilityRegistry(target);
  const capabilityMap = new Map(registry.capabilities.map((capability) => [capability.name, capability]));
  for (const dependency of capabilityDefinitions[capabilityName].dependencies) {
    if (!capabilityMap.has(dependency)) capabilityMap.set(dependency, { name: dependency, state: "scaffolded" });
  }
  if (!capabilityMap.has(capabilityName)) capabilityMap.set(capabilityName, { name: capabilityName, state: "scaffolded" });
  const next = { version: 1, capabilities: [...capabilityMap.values()] };
  const scaffold = plannedInitFiles([...capabilityMap.keys()]);
  const changes = [];
  for (const [destination, source] of scaffold) {
    const destinationPath = path.join(target.projectRoot, destination);
    const sourcePath = path.join(repoRoot, source);
    const existsAlready = fs.existsSync(destinationPath);
    changes.push({ destination, source, action: existsAlready ? "skip-existing" : dryRun ? "would-create" : "create" });
    if (!dryRun && !existsAlready) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
  if (!dryRun) {
    fs.writeFileSync(path.join(target.projectRoot, ".harness-capabilities.json"), `${JSON.stringify(next, null, 2)}\n`);
  }
  return { target, dryRun, registry: next, changes };
}
