import type { normalizeTarget } from "../core-shared.mjs";
import type { ResolvedHarnessPaths } from "../harness-paths.mjs";

export type PresetSource = "project" | "user" | "builtin" | "local" | string;

export type PresetOptions = {
  targetInput?: string;
  home?: string;
};

export type PresetInstallOptions = PresetOptions & {
  force?: boolean;
  scope?: "project" | "user" | string;
  dryRun?: boolean;
  allowScripts?: boolean;
};

export type PresetInputDeclaration = {
  type: string;
  flag: string;
  required: boolean;
  default?: unknown;
  validateOperation: string;
  rejectPlanOnly: boolean;
  requireTarget: boolean;
  targetFromSession: boolean;
};

export type PresetTemplateDeclaration = {
  value?: unknown;
  from?: string;
  default?: unknown;
  label?: string;
};

export type PresetResource = {
  name: string;
  path: string;
  source: string;
  template: string;
  index: {
    id: string;
    type: string;
    summary: string;
    usedBy: string;
    producedBy: string;
  };
};

export type PresetEntrypoint = {
  type: string;
  command: string;
  templates: Record<string, string>;
  writes: string[];
  reads: string[];
  audit: boolean;
};

export type PresetAction = {
  type: string;
  command: string;
  taskRequired: boolean;
  inputs: Record<string, PresetInputDeclaration>;
  writes: string[];
  reads: string[];
  audit: boolean;
};

export type PresetWriteScope = {
  name: string;
  path: string;
  access: string;
};

export type PresetEvidenceFile = {
  path?: string;
  type?: string;
  value?: string;
};

export type PresetPackage = {
  id: string;
  version: number;
  purpose: string;
  compatibleBudgets: string[];
  localeSupport: string[];
  task: Record<string, unknown>;
  inputs: Record<string, PresetInputDeclaration>;
  templateValues: Record<string, PresetTemplateDeclaration>;
  metadata: Record<string, PresetTemplateDeclaration>;
  resources: {
    references: Record<string, PresetResource>;
    artifacts: Record<string, PresetResource>;
  };
  context: {
    requiredReads: string[];
  };
  entrypoints: Record<string, PresetEntrypoint>;
  actions: Record<string, PresetAction>;
  workbench: Record<string, unknown>;
  evidence: {
    bundleDir?: string;
    files?: Record<string, PresetEvidenceFile>;
  } & Record<string, unknown>;
  review: Record<string, unknown>;
  audit: {
    manifestRequired: boolean;
    evidenceFiles: string[];
  };
  writeScopes: PresetWriteScope[];
  newTaskTemplates: Record<string, string>;
  directory: string;
  source: PresetSource;
  manifestPath: string;
  manifestRelativePath: string;
  manifestSha256: string;
  effective?: boolean;
};

export type PresetManifest = Record<string, unknown>;

export type PresetManifestLocation = {
  source: PresetSource;
  manifestPath: string;
};

export type ZipEntryDataOptions = {
  localOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  name: string;
};

export type PresetTarget = ReturnType<typeof normalizeTarget> & {
  harness: ResolvedHarnessPaths;
  input: string;
  docsOnly: boolean;
  structureVersion?: number;
  structureState?: string;
};

export type PresetResolvedInputs = Record<string, unknown>;

export type PresetTemplateValues = Record<string, unknown>;

export type PresetGeneratedFile = {
  relativePath: string;
  source: string;
  content: string;
};

export type PresetResourceIndexRows = {
  references: Array<{
    id: string;
    type: string;
    path: string;
    summary: string;
    usedBy: string;
  }>;
  artifacts: Array<{
    id: string;
    type: string;
    path: string;
    summary: string;
    producedBy: string;
  }>;
};

export type PresetAudit = Record<string, unknown> & {
  writeScopes?: string[];
};

export type PresetContext = {
  kind: string;
  preset: string;
  presetVersion: string;
  presetPackage: PresetPackage;
  audit: PresetAudit;
  resolvedInputs: PresetResolvedInputs;
  taskId: string;
  taskTitle: string;
  taskRelativeDir: string;
  values: PresetTemplateValues;
  migrationTargetLevel?: unknown;
  migrationAchievedLevel?: unknown;
  evidenceBundle: string;
  evidenceFiles?: PresetGeneratedFile[];
  resourceFiles?: PresetGeneratedFile[];
  resourceIndexRows?: PresetResourceIndexRows;
};

export type PresetScopeResolution = {
  writeScopes: string[];
  entrypoints: Record<string, string[]>;
  actions?: Record<string, string[]>;
  reads: Record<string, string[]>;
};
