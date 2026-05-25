import { implementationPhases } from "./phase-kind.mjs";

export function renderDashboard(status) {
  const taskCards = status.tasks
    .map((task) => {
      const phases = task.phases
        .map(
          (phase) => `<div class="phase ${escapeHtml(phase.state)} ${escapeHtml(phase.kind || "execution")}">
            <div class="phase-top"><strong>${escapeHtml(phase.id)}</strong><span>${escapeHtml(phase.kind || "execution")} · ${phase.completion}%</span></div>
            <div class="phase-output">${escapeHtml(phase.output)}</div>
            <div class="meter"><i style="width:${phase.completion}%"></i></div>
            <div class="muted">${escapeHtml(phase.state)} · actor ${escapeHtml(phase.actor || "agent")} · evidence ${escapeHtml(phase.evidenceStatus)}</div>
            ${phase.exitCommand ? `<div class="muted">exit ${escapeHtml(phase.exitCommand)}</div>` : ""}
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
  const scored = implementationPhases(phases);
  if (scored.length === 0) return 0;
  const score = scored.reduce((sum, phase) => {
    if (["present", "waived"].includes(phase.evidenceStatus)) return sum + 100;
    if (phase.evidenceStatus === "partial") return sum + 50;
    return sum;
  }, 0);
  return Math.round(score / scored.length);
}
