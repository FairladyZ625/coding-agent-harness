import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot, readJsonSafe, toPosix, userPresetRootForHome, walkFiles } from "./core-shared.mjs";
import { listBundledPresetIds, seedBundledPresets } from "./preset-registry.mjs";

type StringRecord = Record<string, unknown>;
type CapabilityChange = {
  destination: string;
  source?: string;
  action: string;
  ownership?: string;
  pathFindings?: string[];
};

export const userInstallTargets: Record<string, string[]> = {
  codex: [".codex", "skills", "coding-agent-harness"],
  claude: [".claude", "skills", "coding-agent-harness"],
  gemini: [".gemini", "skills", "coding-agent-harness"],
  openclaw: [".openclaw", "skills", "coding-agent-harness"],
  agents: [".agents", "skills", "coding-agent-harness"],
};

function packageVersion(): string {
  try {
    const pkg = readJsonSafe<StringRecord>(path.join(repoRoot, "package.json"), {});
    return String(pkg.version || "");
  } catch {
    return "";
  }
}

function userHome(home = ""): string {
  return path.resolve(home || os.homedir());
}

function normalizeUserAgent(agent = "codex"): string[] {
  const normalized = String(agent || "codex").toLowerCase();
  if (normalized === "all") return Object.keys(userInstallTargets);
  if (!userInstallTargets[normalized]) throw new Error(`Unknown user agent target: ${agent}`);
  return [normalized];
}

function targetForUserAgent(agent: string, home = ""): string {
  return path.join(userHome(home), ...userInstallTargets[agent]);
}

function skillPackageEntries(): string[] {
  return [
    "README.md",
    "CHANGELOG.md",
    "SKILL.md",
    "LICENSE",
    "package.json",
    "references",
    "templates",
    "templates-zh-CN",
    "presets",
    "dist",
    "docs-release",
    "examples",
  ];
}

function listPackageFiles(): string[] {
  return skillPackageEntries()
    .flatMap((entry) => {
      const fullPath = path.join(repoRoot, entry);
      if (!fs.existsSync(fullPath)) return [];
      if (fs.statSync(fullPath).isFile()) return [toPosix(path.relative(repoRoot, fullPath))];
      return walkFiles(fullPath).map((file) => toPosix(path.relative(repoRoot, file)));
    })
    .sort();
}

function copySkillPackage(targetRoot: string, { dryRun = false, force = false }: { dryRun?: boolean; force?: boolean } = {}): CapabilityChange[] {
  const changes: CapabilityChange[] = [];
  for (const relativeFile of listPackageFiles()) {
    const source = path.join(repoRoot, relativeFile);
    const destination = path.join(targetRoot, relativeFile);
    const existsAlready = fs.existsSync(destination);
    const action = existsAlready ? (force ? "overwrite" : "skip-existing") : dryRun ? "would-create" : "create";
    changes.push({ source: relativeFile, destination, action });
    if (dryRun || (existsAlready && !force)) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return changes;
}

export function installUserSkill({ agent = "codex", home = "", dryRun = false, force = false, seedPresets = true }: { agent?: string; home?: string; dryRun?: boolean; force?: boolean; seedPresets?: boolean } = {}) {
  const agents = normalizeUserAgent(agent);
  const targets = agents.map((targetAgent) => {
    const target = targetForUserAgent(targetAgent, home);
    const changes = copySkillPackage(target, { dryRun, force });
    return {
      agent: targetAgent,
      target,
      changes,
      created: changes.filter((change) => ["create", "would-create"].includes(change.action)).length,
      overwritten: changes.filter((change) => change.action === "overwrite").length,
      skipped: changes.filter((change) => change.action === "skip-existing").length,
    };
  });
  const presetSeed = seedPresets ? seedBundledPresets({ scope: "user", home, dryRun, force }) : null;
  const changed = targets.some((target) => target.created > 0 || target.overwritten > 0) || (presetSeed && (presetSeed.created > 0 || presetSeed.overwritten > 0));
  const onlySkipped =
    targets.every((target) => target.created === 0 && target.overwritten === 0 && target.skipped > 0) &&
    (!presetSeed || presetSeed.presets.every((preset) => preset.action === "skip-existing"));
  return {
    operation: "install-user",
    status: dryRun ? "dry-run" : changed ? "installed" : onlySkipped ? "already-present" : "no-op",
    dryRun,
    force,
    version: packageVersion(),
    source: repoRoot,
    presets: presetSeed,
    targets,
  };
}

function readInstalledVersion(targetRoot: string): string {
  try {
    const pkg = readJsonSafe<StringRecord>(path.join(targetRoot, "package.json"), {});
    return String(pkg.version || "");
  } catch {
    return "";
  }
}

function commandOnPath(command: string): string {
  const paths = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const extensions = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const base of paths) {
    for (const extension of extensions) {
      const candidate = path.join(base, `${command}${extension}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "";
}

export function doctorUserSkill({ agent = "codex", home = "" }: { agent?: string; home?: string } = {}) {
  const required = [
    "SKILL.md",
    "package.json",
    "references",
    "templates",
    "templates-zh-CN",
    "presets",
    "dist/harness.mjs",
    "docs-release/guides/agent-installation.md",
  ];
  const targets = normalizeUserAgent(agent).map((targetAgent) => {
    const target = targetForUserAgent(targetAgent, home);
    const missing = required.filter((relativePath) => !fs.existsSync(path.join(target, relativePath)));
    return {
      agent: targetAgent,
      target,
      status: missing.length === 0 ? "pass" : "fail",
      version: readInstalledVersion(target),
      missing,
    };
  });
  const presetRoot = userPresetRootForHome(home);
  const missingPresets = listBundledPresetIds().filter((id) => !fs.existsSync(path.join(presetRoot, id, "preset.yaml")));
  const presets = {
    root: presetRoot,
    status: missingPresets.length === 0 ? "pass" : "fail",
    missing: missingPresets,
  };
  const harnessCommand = commandOnPath("harness");
  return {
    operation: "doctor-user",
    status: targets.every((target) => target.status === "pass") && presets.status === "pass" ? "pass" : "fail",
    version: packageVersion(),
    harnessCommand: harnessCommand || null,
    presets,
    targets,
  };
}
