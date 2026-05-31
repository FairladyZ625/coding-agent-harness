import fs from "node:fs";

export type KernelHarnessModuleDefinition = {
  title?: string;
  prefix?: string;
  status?: string;
  branch?: string;
  owner?: string;
  currentStep?: string;
  scope?: string[];
  shared?: string[];
  dependsOn?: string[];
  plan?: string;
  brief?: string;
  updated?: string;
  [key: string]: unknown;
};

export type KernelHarnessModulesManifest = {
  schema?: string;
  generatedView?: string;
  items: Record<string, KernelHarnessModuleDefinition>;
  [key: string]: unknown;
};

export type KernelHarnessManifest = {
  version: number;
  locale: string;
  capabilities: string[];
  structure: Record<string, string>;
  modules?: KernelHarnessModulesManifest;
  harnessRoot?: string;
  [key: string]: unknown;
};

export function readHarnessManifest(manifestPath: string): KernelHarnessManifest | null {
  if (!fs.existsSync(manifestPath)) return null;
  const manifest: KernelHarnessManifest = { version: 2, locale: "en-US", capabilities: [], structure: {} };
  let section = "";
  let inModuleItems = false;
  let currentModuleKey = "";
  let currentModuleListField = "";
  for (const rawLine of fs.readFileSync(manifestPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const top = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (top) {
      section = top[1];
      inModuleItems = false;
      currentModuleKey = "";
      currentModuleListField = "";
      if (section === "version") manifest.version = Number(top[2]) || 2;
      else if (section === "locale") manifest.locale = top[2] || "en-US";
      else if (section === "modules") manifest.modules = { items: {} };
      else if (section !== "structure" && section !== "capabilities") manifest[section] = top[2];
      continue;
    }
    const listItem = line.match(/^\s*-\s*(.+)$/);
    if (section === "capabilities" && listItem) {
      manifest.capabilities.push(listItem[1].trim());
      continue;
    }
    const nested = line.match(/^\s+([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
    if (section === "structure" && nested) manifest.structure[nested[1]] = nested[2].trim();
    if (section === "modules") {
      if (!manifest.modules) manifest.modules = { items: {} };
      const moduleTop = line.match(/^  ([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (moduleTop) {
        currentModuleKey = "";
        currentModuleListField = "";
        if (moduleTop[1] === "items") inModuleItems = true;
        else if (moduleTop[1] === "schema") manifest.modules.schema = moduleTop[2].trim();
        else if (moduleTop[1] === "generatedView") manifest.modules.generatedView = moduleTop[2].trim();
        else manifest.modules[moduleTop[1]] = moduleTop[2].trim();
        continue;
      }
      const moduleItem = line.match(/^    ([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (inModuleItems && moduleItem) {
        currentModuleKey = moduleItem[1];
        currentModuleListField = "";
        if (!manifest.modules.items[currentModuleKey]) manifest.modules.items[currentModuleKey] = {};
        continue;
      }
      const moduleField = line.match(/^      ([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (inModuleItems && currentModuleKey && moduleField) {
        const field = moduleField[1];
        const raw = moduleField[2].trim();
        if (["scope", "shared", "dependsOn"].includes(field)) {
          manifest.modules.items[currentModuleKey][field] = raw === "[]" ? [] : raw ? [raw] : [];
          currentModuleListField = field;
        } else {
          manifest.modules.items[currentModuleKey][field] = raw;
          currentModuleListField = "";
        }
        continue;
      }
      const moduleListItem = line.match(/^        -\s*(.+)$/);
      if (inModuleItems && currentModuleKey && currentModuleListField && moduleListItem) {
        const existing = manifest.modules.items[currentModuleKey][currentModuleListField];
        manifest.modules.items[currentModuleKey][currentModuleListField] = [
          ...(Array.isArray(existing) ? existing : []),
          moduleListItem[1].trim(),
        ];
      }
    }
  }
  if (!manifest.structure.harnessRoot && manifest.harnessRoot) manifest.structure.harnessRoot = manifest.harnessRoot;
  if (!manifest.structure.planningRoot && manifest.harnessRoot) manifest.structure.planningRoot = `${manifest.harnessRoot}/planning`;
  return manifest;
}

export function renderHarnessManifest({ locale, capabilities, structure = null, modules = null }: { locale: string; capabilities: string[]; structure?: Record<string, string> | null; modules?: KernelHarnessModulesManifest | null }): string {
  const manifestStructure = structure || {
    harnessRoot: "coding-agent-harness",
    planningRoot: "coding-agent-harness/planning",
    tasksRoot: "coding-agent-harness/planning/tasks",
    modulesRoot: "coding-agent-harness/planning/modules",
    externalRoot: "coding-agent-harness/planning/external",
    governanceRoot: "coding-agent-harness/governance",
    generatedRoot: "coding-agent-harness/governance/generated",
  };
  const lines = [
    "version: 2",
    `locale: ${locale}`,
    "capabilities:",
    ...capabilities.map((capability) => `  - ${capability}`),
    "structure:",
    ...Object.entries(manifestStructure).map(([key, value]) => `  ${key}: ${value}`),
  ];
  if (modules && (modules.schema || modules.generatedView || Object.keys(modules.items || {}).length > 0)) {
    lines.push("modules:");
    if (modules.schema) lines.push(`  schema: ${yamlScalar(modules.schema)}`);
    if (modules.generatedView) lines.push(`  generatedView: ${yamlScalar(modules.generatedView)}`);
    lines.push("  items:");
    for (const [key, module] of Object.entries(modules.items || {}).sort(([left], [right]) => left.localeCompare(right))) {
      lines.push(`    ${key}:`);
      for (const field of ["title", "prefix", "status", "branch", "owner", "currentStep", "scope", "shared", "dependsOn", "plan", "brief", "updated"]) {
        const value = module[field];
        if (Array.isArray(value)) {
          lines.push(`      ${field}:${value.length ? "" : " []"}`);
          for (const item of value) lines.push(`        - ${yamlScalar(String(item))}`);
        } else if (value !== undefined && value !== null && String(value) !== "") {
          lines.push(`      ${field}: ${yamlScalar(String(value))}`);
        }
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function assertRenderableHarnessManifest(manifest: KernelHarnessManifest | null | undefined): void {
  if (!manifest) return;
  const allowed = new Set(["version", "locale", "capabilities", "structure", "modules", "harnessRoot"]);
  const unknown = Object.keys(manifest).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`Cannot rewrite harness.yaml with unknown top-level fields: ${unknown.join(", ")}`);
}

function yamlScalar(value: string): string {
  const raw = String(value || "");
  if (!raw) return "''";
  if (/[:#\n\r]|^\s|\s$|^(?:true|false|null|\d+(?:\.\d+)?)$/i.test(raw)) return JSON.stringify(raw);
  return raw;
}
