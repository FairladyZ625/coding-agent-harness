import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  repoRoot,
  legacyChecker,
  visualMapFile,
  legacyVisualRoadmapFile,
  lessonCandidatesFile,
  allowedReviewDispositions,
  allowedPhaseStates,
  allowedEvidenceStatus,
  normalizeTarget,
  toPosix,
  readFileSafe,
  walkFiles,
} from "./core-shared.mjs";
import {
  tableAfterHeading,
  getColumn,
  getColumnAny,
  splitList,
  firstColumn,
  contentHasAny,
} from "./markdown-utils.mjs";
import {
  capabilityDefinitions,
  validateCapabilities,
} from "./capability-registry.mjs";
import {
  collectTasks,
  listTaskPlanPaths,
  parseTaskBudget,
  parseTaskContractInfo,
  readVisualMapContractFile,
  parsePhases,
  taskCutoverCounters,
} from "./task-scanner.mjs";

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
    const requiredSections = [
      ["Reviewer Identity", "Reviewer 身份", "审查者身份"],
      ["Confidence Challenge", "信心挑战"],
      ["Evidence Checked", "已检查 Evidence", "已检查证据"],
      ["Final Confidence Basis", "最终信心依据"],
    ];
    for (const [label, ...aliases] of requiredSections) {
      if (!contentHasAny(content, [label, ...aliases])) {
        if (strict) failures.push(`${relative} missing ${label}`);
        else warnings.push(`${relative} missing ${label}`);
      }
    }
    const evidenceTable = tableAfterHeading(content, /^(Evidence ID|证据 ID)$/i);
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
    const severityIndex = getColumnAny(header, ["Severity", "严重级别"]);
    const openIndex = getColumnAny(header, ["Open", "是否开放"]);
    const dispositionIndex = getColumnAny(header, ["Disposition", "处置"]);
    const blocksIndex = getColumnAny(header, ["Blocks Release", "是否阻塞发布"]);
    const followUpIndex = getColumnAny(header, ["Follow-up", "跟进"]);
    const evidenceCheckedIndex = getColumnAny(header, ["Evidence Checked", "已检查证据"]);
    if ([severityIndex, openIndex, dispositionIndex, blocksIndex].some((index) => index < 0)) {
      report(`${relative} findings table missing Severity/Open/Disposition/Blocks Release columns`);
      continue;
    }
    for (const row of rows) {
      const id = row[0] || "";
      const severity = row[severityIndex] || "";
      if (!/^P[0-3]$/.test(severity) && !/^(R|SR)-\d+/i.test(id)) continue;
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

export function validateVisualMaps(target) {
  const failures = [];
  const warnings = [];
  for (const taskPlanPath of listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    const visualMapPath = path.join(taskDir, visualMapFile);
    const legacyPath = path.join(taskDir, legacyVisualRoadmapFile);
    const relative = toPosix(path.relative(target.projectRoot, visualMapPath));
    const taskPlan = readFileSafe(taskPlanPath);
    const visualMap = readVisualMapContractFile(taskDir, taskPlan);
    const { header, rows } = tableAfterHeading(visualMap.content, /^Phase ID$/i);
    if (rows.length > 0) {
      for (const column of ["Phase ID", "Depends On", "State", "Completion", "Output", "Required Evidence", "Evidence Status", "Blocking Risk", "Owner / Handoff"]) {
        if (getColumn(header, column) < 0) failures.push(`${relative} Visual Map missing column: ${column}`);
      }
    }
    const phases = parsePhases(visualMap.content);
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
    if (visualMap.source === "canonical" && !/Visual Map Contract:\s*v1\.0/i.test(visualMap.content)) {
      failures.push(`${relative} missing Visual Map Contract: v1.0`);
    }
    if (visualMap.source === "canonical" && phases.length === 0) warnings.push(`${relative} has no Visual Map phase table`);
    if (visualMap.source === "legacy" && fs.existsSync(legacyPath)) {
      warnings.push(`${relative} missing; legacy visual_roadmap.md is rewrite input only`);
    } else if (visualMap.source === "legacy" && phases.length > 0) {
      warnings.push(`${relative} missing; using legacy task_plan.md visual map fallback`);
    }
  }
  return { failures, warnings };
}

export function validatePlanContracts(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  for (const taskPlanPath of listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    const relativeDir = toPosix(path.relative(target.projectRoot, taskDir));
    const taskPlanContent = readFileSafe(taskPlanPath);
    const budget = parseTaskBudget(taskPlanContent);
    const taskContract = parseTaskContractInfo(taskPlanContent);
    if (!taskContract.generated) {
      warnings.push(`adoption-needed: ${relativeDir} missing Task Contract: harness-task/v1 marker`);
    }
    const requiredFiles = budget === "simple" ? [visualMapFile] : ["execution_strategy.md", visualMapFile, lessonCandidatesFile];
    for (const fileName of requiredFiles) {
      if (!fs.existsSync(path.join(taskDir, fileName))) {
        if (taskContract.generated) failures.push(`${relativeDir} missing ${fileName}`);
        else report(`${relativeDir} missing ${fileName}`);
      }
    }
  }
  return { failures, warnings };
}

export function validateContextDocs(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  const contextRoots = ["03-ARCHITECTURE", "04-DEVELOPMENT", "06-INTEGRATIONS"];
  const files = contextRoots.flatMap((root) => walkFiles(path.join(target.docsRoot, root))).filter((file) => file.endsWith(".md"));
  for (const file of files) {
    if (file.includes(`${path.sep}_archive${path.sep}`)) continue;
    const relative = toPosix(path.relative(target.projectRoot, file));
    const content = readFileSafe(file);
    if (!/Context Doc Type:\s*\S+/i.test(content) && !/上下文文档类型[：:]\s*\S+/.test(content)) report(`${relative} missing Context Doc Type`);
    if (path.basename(file) === "README.md") continue;
    if (!contentHasAny(content, [/Source Evidence/i, "来源证据"])) report(`${relative} missing Source Evidence field`);
    if (!/Last Verified:\s*\S+|Last Verified\s*\|/i.test(content) && !/最近验证[：:]\s*\S+|最近验证\s*\|/.test(content)) report(`${relative} missing Last Verified field`);
    if (!/Confidence:\s*(high|medium|low|unknown)|Confidence\s*\|/i.test(content) && !/信心[：:]\s*(high|medium|low|unknown|高|中|低|未知)|信心\s*\|/.test(content)) report(`${relative} missing Confidence field`);
    if (/03-ARCHITECTURE\/service-catalog\.md$/.test(relative)) {
      for (const [column, ...aliases] of [
        ["Service / Component", "服务 / 组件"],
        ["Interfaces", "接口"],
        ["Source Evidence", "来源证据"],
        ["Last Verified", "最近验证"],
        ["Confidence", "信心"],
      ]) {
        if (!contentHasAny(content, [column, ...aliases])) report(`${relative} service catalog missing column: ${column}`);
      }
    }
    if (/04-DEVELOPMENT\/external-context\/[^/]+\.md$/.test(relative)) {
      for (const [heading, ...aliases] of [
        ["Development Use", "开发用途"],
        ["Do Not Assume", "不要假设"],
        ["Mocks / Stubs", "Mock / Stub", "模拟 / 桩"],
      ]) {
        if (!contentHasAny(content, [heading, ...aliases])) report(`${relative} external context missing section: ${heading}`);
      }
    }
    if (/06-INTEGRATIONS\/(?:[^/_][^/]*|third-party\/[^/_][^/]*)\.md$/.test(relative)) {
      for (const [heading, ...aliases] of [
        ["Contract Type", "合同类型"],
        ["Auth", "认证"],
        ["Payload", "载荷"],
        ["Errors", "错误"],
        ["Contract Tests", "合同测试"],
      ]) {
        if (!contentHasAny(content, [heading, ...aliases])) report(`${relative} integration contract missing section: ${heading}`);
      }
    }
  }
  return { failures, warnings };
}

export function buildStatus(targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const capabilityState = validateCapabilities(target);
  const declaredCapabilities = new Set(capabilityState.registry.capabilities.map((capability) => capability.name));
  const safeAdoptionMode = declaredCapabilities.has("safe-adoption");
  const shouldRunLegacy = !options.skipLegacyCheck && (capabilityState.registry.mode === "legacy-compat" || safeAdoptionMode);
  const legacy = shouldRunLegacy ? runLegacyCheck(target) : { status: "skipped", code: 0, stdout: "", stderr: "" };
  const contractStrict = Boolean(options.strict) || (capabilityState.registry.mode !== "legacy-compat" && !safeAdoptionMode);
  const reviews = validateReviewSchema(target, { strict: contractStrict });
  const visualMaps = validateVisualMaps(target);
  const planContracts = validatePlanContracts(target, { strict: contractStrict });
  const contextDocs = validateContextDocs(target, { strict: contractStrict });
  const failures = [...capabilityState.failures, ...reviews.failures, ...visualMaps.failures, ...planContracts.failures, ...contextDocs.failures];
  const warnings = [...capabilityState.warnings, ...reviews.warnings, ...visualMaps.warnings, ...planContracts.warnings, ...contextDocs.warnings];
  if (legacy.status === "fail") {
    if (options.strictLegacy) failures.push("legacy check failed");
    else warnings.push(`adoption-needed: legacy check failed: ${(legacy.stderr || legacy.stdout).trim()}`);
  }

  const tasks = collectTasks(target);
  const briefReady = tasks.filter((task) => task.briefSource === "standalone").length;
  const briefMissing = tasks.length - briefReady;
  for (const task of tasks) {
    if (task.stateSource === "invalid") {
      const message = `${task.path}/progress.md invalid task state: ${task.stateRaw}`;
      if (contractStrict || options.strictLegacy) failures.push(message);
      else warnings.push(`adoption-needed: ${message}`);
    }
  }
  const capabilityNames = new Map(capabilityState.registry.capabilities.map((capability) => [capability.name, capability]));
  for (const detected of capabilityState.detected) {
    if (!capabilityNames.has(detected)) capabilityNames.set(detected, { name: detected, state: "configured" });
  }
  const cutoverCounters = taskCutoverCounters(tasks);
  const fullCutoverEligible =
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
    generatedAt: new Date().toISOString(),
    mode: capabilityState.registry.mode,
    checkState: {
      status: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
      failures: failures.length,
      warnings: warnings.length,
      details: { failures, warnings },
      legacy,
    },
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
