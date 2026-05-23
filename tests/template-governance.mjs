#!/usr/bin/env node

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const skillContent = fs.readFileSync(path.join(repoRoot, "SKILL.md"), "utf8");
assert(!skillContent.includes("Historical 12-Phase Bootstrap"), "SKILL.md should not carry the legacy 12-phase reference body");
assert(
  skillContent.includes("references/legacy-12-phase-bootstrap.md"),
  "SKILL.md should route legacy bootstrap details to the reference document",
);
assert(
  fs.readFileSync(path.join(repoRoot, "references/legacy-12-phase-bootstrap.md"), "utf8").includes("Historical 12-Phase Bootstrap"),
  "legacy 12-phase bootstrap reference should exist",
);

const englishTemplateFiles = relativeFiles(path.join(repoRoot, "templates"));
const chineseTemplateFiles = relativeFiles(path.join(repoRoot, "templates-zh-CN"));
const englishNonDashboardTemplateFiles = englishTemplateFiles.filter((file) => !file.startsWith("dashboard/"));
const chineseNonDashboardTemplateFiles = chineseTemplateFiles.filter((file) => !file.startsWith("dashboard/"));
assert(englishTemplateFiles.length > 0, "templates/ should contain English templates");
assert(chineseTemplateFiles.length > 0, "templates-zh-CN should contain Chinese templates");
assert(
  JSON.stringify(englishNonDashboardTemplateFiles) === JSON.stringify(chineseNonDashboardTemplateFiles),
  "templates/ and templates-zh-CN/ should expose the same non-dashboard template file set",
);
assert(!chineseTemplateFiles.some((file) => file.startsWith("dashboard/")), "templates-zh-CN/dashboard should be removed; dashboard uses runtime i18n");
for (const relativeFile of englishNonDashboardTemplateFiles) {
  const content = fs.readFileSync(path.join(repoRoot, "templates", relativeFile), "utf8");
  assert(!chineseCharacterPattern.test(content), `English template contains Chinese text: ${relativeFile}`);
  assert(!brokenMechanicalTemplatePattern.test(content), `English template contains mechanical placeholder text: ${relativeFile}`);
  assert(!staleDispositionPattern.test(content), `English template contains stale disposition vocabulary: ${relativeFile}`);
  assert(!sampleOpenFindingPattern.test(content), `English template contains a real open sample finding row: ${relativeFile}`);
}
assert(
  fs.readFileSync(path.join(repoRoot, "templates-zh-CN", "AGENTS.md.template"), "utf8").includes("项目概况"),
  "templates-zh-CN should provide Chinese AGENTS.md content",
);
for (const relativeFile of chineseNonDashboardTemplateFiles) {
  const content = fs.readFileSync(path.join(repoRoot, "templates-zh-CN", relativeFile), "utf8");
  assert(!brokenMechanicalTemplatePattern.test(content), `Chinese template contains mechanical placeholder text: ${relativeFile}`);
  assert(!staleDispositionPattern.test(content), `Chinese template contains stale disposition vocabulary: ${relativeFile}`);
  assert(!sampleOpenFindingPattern.test(content), `Chinese template contains a real open sample finding row: ${relativeFile}`);
  assert(!englishFirstZhHeadingPattern.test(content), `Chinese template contains English-first review heading: ${relativeFile}`);
  assert(!zhMechanicalEnglishWorkflowPattern.test(content), `Chinese template contains unlocalized workflow phrase: ${relativeFile}`);
  assert(!zhMechanicalEvidencePhrasePattern.test(content), `Chinese template contains unlocalized evidence phrase: ${relativeFile}`);
}

function relativeFiles(root) {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
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

console.log("Template governance tests passed");
