#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const chineseCharacterPattern = /\p{Script=Han}/u;
const brokenMechanicalTemplatePattern = /\bfill in(?:[A-Z]|\w)|(?:[a-z])fill in\b|TODO/;
const staleDispositionPattern = /\b((?:open\s*\/\s*)?fixed\s*\/\s*accepted\s*\/\s*deferred\s*\/\s*n\/a|accepted[- ]residuals?|accepted\s+(?:with|as)\s+residual|accepted\s+by\s+owner|accepted\s+waiver)\b/i;
const sampleOpenFindingPattern = /^\|\s*(?:F|R|SR|V|RR|HL)-\d+\s*\|.*\|\s*(?:open|yes\s*\|\s*open|yes\s*\/\s*no\s*\|\s*open)\s*\|?\s*$/im;
const englishFirstZhHeadingPattern = /^#{1,6}\s+(?:Reviewer Identity|Confidence Challenge|Material Findings|Non-Material Notes|Evidence Checked|Final Confidence Basis|Follow-Up Routing|Phase Graph|Phase Table|Context Packet|Artifact Index|Stop Condition|Pause Conditions|Deliverables|Module Session Prompt|Subagent\s*\/\s*Worker|Coordinator|Worktree|Slice ID|Parent Phase|Inputs|Verifier\b|Harness\b|Closeout\b|Lessons\b)/m;
const zhMechanicalEnglishWorkflowPattern = /^\s*\d+\.\s*(?:implement|run locally|self-review|rerun evidence)\b/im;
const zhMechanicalEvidencePhrasePattern = /\b(?:local smoke|browser or UI inspection|live environment smoke|reviewer findings|PR checks\s*\/\s*workflow run)\b/i;
const manualLifecycleTablePatterns = [
    /Feature SSoT entry/i,
    /Feature SSoT:\s*`?docs\/09-PLANNING\/Feature-SSoT\.md`?/i,
    /Feature SSoT：\s*`?docs\/09-PLANNING\/Feature-SSoT\.md`?/i,
    /writes? back to Feature SSoT/i,
    /route it through Feature SSoT/i,
    /must simultaneously update progress\.md and Feature SSoT/i,
    /whether to write back to Feature SSoT/i,
    /回写到 Feature SSoT/i,
    /回写 Feature SSoT/i,
    /是否回写 Feature SSoT/i,
    /必须同时更新 progress\.md 和 Feature SSoT/i,
    /功能 SSoT 条目/,
    /功能进度写入 Feature SSoT/,
];
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
const skillContent = fs.readFileSync(path.join(repoRoot, "SKILL.md"), "utf8");
assert(!skillContent.includes("Historical 12-Phase Bootstrap"), "SKILL.md should not carry the legacy 12-phase reference body");
assert(skillContent.includes("references/legacy-12-phase-bootstrap.md"), "SKILL.md should route legacy bootstrap details to the reference document");
assert(fs.readFileSync(path.join(repoRoot, "references/legacy-12-phase-bootstrap.md"), "utf8").includes("Historical 12-Phase Bootstrap"), "legacy 12-phase bootstrap reference should exist");
const englishTemplateFiles = relativeFiles(path.join(repoRoot, "templates"));
const chineseTemplateFiles = relativeFiles(path.join(repoRoot, "templates-zh-CN"));
const englishNonDashboardTemplateFiles = englishTemplateFiles.filter((file) => !file.startsWith("dashboard/"));
const chineseNonDashboardTemplateFiles = chineseTemplateFiles.filter((file) => !file.startsWith("dashboard/"));
assert(englishTemplateFiles.length > 0, "templates/ should contain English templates");
assert(chineseTemplateFiles.length > 0, "templates-zh-CN should contain Chinese templates");
assert(JSON.stringify(englishNonDashboardTemplateFiles) === JSON.stringify(chineseNonDashboardTemplateFiles), "templates/ and templates-zh-CN/ should expose the same non-dashboard template file set");
assert(!chineseTemplateFiles.some((file) => file.startsWith("dashboard/")), "templates-zh-CN/dashboard should be removed; dashboard uses runtime i18n");
for (const relativeFile of englishNonDashboardTemplateFiles) {
    const content = fs.readFileSync(path.join(repoRoot, "templates", relativeFile), "utf8");
    assert(!chineseCharacterPattern.test(content), `English template contains Chinese text: ${relativeFile}`);
    assert(!brokenMechanicalTemplatePattern.test(content), `English template contains mechanical placeholder text: ${relativeFile}`);
    assert(!staleDispositionPattern.test(content), `English template contains stale disposition vocabulary: ${relativeFile}`);
    assert(!sampleOpenFindingPattern.test(content), `English template contains a real open sample finding row: ${relativeFile}`);
}
assert(fs.readFileSync(path.join(repoRoot, "templates-zh-CN", "AGENTS.md.template"), "utf8").includes("项目概况"), "templates-zh-CN should provide Chinese AGENTS.md content");
const agentsTemplate = fs.readFileSync(path.join(repoRoot, "templates", "AGENTS.md.template"), "utf8");
assert(agentsTemplate.includes("no-commit reason"), "English AGENTS template should require a no-commit reason when a verified slice is not committed");
assert(agentsTemplate.includes("dirty ownership"), "English AGENTS template should name dirty ownership as a commit deferral condition");
assert(agentsTemplate.includes("unrelated dirty changes"), "English AGENTS template should forbid mixing unrelated dirty changes into commits");
const zhAgentsTemplate = fs.readFileSync(path.join(repoRoot, "templates-zh-CN", "AGENTS.md.template"), "utf8");
assert(zhAgentsTemplate.includes("no-commit reason"), "Chinese AGENTS template should require a no-commit reason when a verified slice is not committed");
assert(zhAgentsTemplate.includes("归属不清"), "Chinese AGENTS template should name unclear dirty ownership as a commit deferral condition");
for (const relativeFile of chineseNonDashboardTemplateFiles) {
    const content = fs.readFileSync(path.join(repoRoot, "templates-zh-CN", relativeFile), "utf8");
    assert(!brokenMechanicalTemplatePattern.test(content), `Chinese template contains mechanical placeholder text: ${relativeFile}`);
    assert(!staleDispositionPattern.test(content), `Chinese template contains stale disposition vocabulary: ${relativeFile}`);
    assert(!sampleOpenFindingPattern.test(content), `Chinese template contains a real open sample finding row: ${relativeFile}`);
    assert(!englishFirstZhHeadingPattern.test(content), `Chinese template contains English-first review heading: ${relativeFile}`);
    assert(!zhMechanicalEnglishWorkflowPattern.test(content), `Chinese template contains unlocalized workflow phrase: ${relativeFile}`);
    assert(!zhMechanicalEvidencePhrasePattern.test(content), `Chinese template contains unlocalized evidence phrase: ${relativeFile}`);
}
for (const relativeFile of lifecycleContractFiles()) {
    const content = fs.readFileSync(path.join(repoRoot, relativeFile), "utf8");
    for (const pattern of manualLifecycleTablePatterns) {
        assert(!pattern.test(content), `${relativeFile} still instructs agents to manually maintain Feature SSoT lifecycle tables: ${pattern}`);
    }
}
function relativeFiles(root) {
    const results = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walk(full);
            }
            else {
                results.push(toPosix(path.relative(root, full)));
            }
        }
    }
    walk(root);
    return results.sort();
}
function toPosix(value) {
    return value.split(path.sep).join("/");
}
function lifecycleContractFiles() {
    return [
        "SKILL.md",
        "templates/AGENTS.md.template",
        "templates-zh-CN/AGENTS.md.template",
        "templates/planning/task_plan.md",
        "templates-zh-CN/planning/task_plan.md",
        "templates/ledger/Harness-Ledger.md",
        "templates-zh-CN/ledger/Harness-Ledger.md",
        "references/planning-loop.md",
        "references/harness-ledger.md",
        "references/ssot-governance.md",
        "docs-release/guides/migration-playbook.md",
        "docs-release/guides/migration-playbook.en-US.md",
    ];
}
console.log("Template governance tests passed");
