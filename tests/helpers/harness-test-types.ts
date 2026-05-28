export type HarnessTestCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type HarnessTestJsonResult<TPayload> = HarnessTestCommandResult & {
  payload: TPayload;
};

export type HarnessTestLooseChange = {
  action?: string;
  destination: string;
  [key: string]: unknown;
};

export type HarnessTestLooseCapability = {
  name: string;
  default?: boolean;
  selected?: boolean;
  state?: string;
  [key: string]: unknown;
};

export type HarnessTestLoosePreset = {
  id: string;
  source?: string;
  action?: string;
  purpose?: string;
  [key: string]: unknown;
};

export type HarnessTestLooseAction = {
  action?: string;
  destination?: string;
  [key: string]: unknown;
};

export type HarnessTestLooseTask = {
  id: string;
  path: string;
  state: string;
  taskPreset?: string;
  taskKind?: string;
  presetVersion?: string;
  evidenceBundle?: string;
  preset?: string;
  kind?: string;
  reviewStatus: string;
  lessonCandidateStatus: string;
  archiveMetadata?: Record<string, string>;
  phases: Array<{ requiredEvidence: unknown[] }>;
  [key: string]: unknown;
};

export type HarnessTestLooseJson = {
  [key: string]: unknown;
  action: string;
  applied: boolean;
  archiveMetadata: Record<string, string>;
  actions: HarnessTestLooseAction[];
  actionsApplied: HarnessTestLooseAction[];
  capabilities: HarnessTestLooseCapability[] & { locale: string; names: string[] };
  changes: HarnessTestLooseChange[];
  checkState: { status: string; warnings: number; details: { warnings: string[] } };
  context: { requiredReads: string[] };
  dryRun: boolean;
  destination: string;
  entrypoint: string;
  entrypoints: Record<string, { type: string }>;
  evidenceBundle: string;
  id: string;
  inputs: Record<string, { flag: string; required: boolean }>;
  installed: boolean;
  locale: string;
  materialized: Array<{ destination?: string; [key: string]: unknown }>;
  manifestPath: string;
  metadata: Record<string, { from: string }>;
  mode: string;
  nextCommands: string[];
  operation: string;
  preset: string;
  presetSeed: { scope: string };
  presets: HarnessTestLoosePreset[] & { presets: HarnessTestLoosePreset[]; status?: string };
  project: { name: string; docsOnly?: boolean };
  projectAuthoredFindings: Array<{ destination: string; action: string }>;
  projections: Array<{ destination: string; action: string }>;
  purpose: string;
  removed: boolean;
  report: { capabilities: HarnessTestLooseCapability[]; agentInstructions: string[]; locale: string };
  resources: { references: Record<string, { index: { id: string } }> };
  skipped: number;
  source: string;
  status: string;
  target: string;
  targets: Array<{ agent: string; changes: HarnessTestLooseChange[]; version: string }>;
  task: { id: string; path: string; kind: string; preset: string; evidenceBundle: string };
  tasks: HarnessTestLooseTask[];
  templateValues: Record<string, { from: string }>;
};

export type HarnessTestPaths = {
  repoRoot: string;
  cli: string;
  tmpRoot: string;
};

export type WorkbenchRuntime = {
  url: string;
  csrf: string;
  stdout: string;
  stderr: string;
};

export type ZipFixtureEntry = {
  name: string;
  data: string | Uint8Array;
  method?: number;
  compressedData?: Uint8Array;
  compressedSize?: number;
  uncompressedSize?: number;
  flags?: number;
  externalAttributes?: number;
};
