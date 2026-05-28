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

export type HarnessTestLoosePhase = {
  id: string;
  actor?: string;
  completion?: number;
  kind?: string;
  requiredEvidence: unknown[];
  state?: string;
  [key: string]: unknown;
};

export type HarnessTestLooseTask = {
  id: string;
  briefPath: string;
  briefSource: string;
  budget: string;
  classificationBucket: string;
  closeoutStatus: string;
  deletionState: string;
  hiddenByDefault: boolean;
  evidence?: Array<{ summary: string; [key: string]: unknown }>;
  path: string;
  state: string;
  title: string;
  shortId: string;
  supersededBy: string;
  taskKey: string;
  taskPreset?: string;
  taskKind?: string;
  presetVersion?: string;
  presetAudit?: { commandWriteScopes?: string[]; manifestPath: string; [key: string]: unknown };
  evidenceBundle: string;
  preset?: string;
  kind?: string;
  reviewStatus: string;
  reviewQueueState: string;
  reviewSubmitted: boolean;
  materialsReady: boolean;
  lifecycleState?: string;
  longRunning?: boolean;
  lessonCandidateDecisionComplete?: boolean;
  lessonCandidateStatus: string;
  lessonCandidateIssues: string[];
  lessonCandidateRows: Array<{
    boundaryReason: string;
    conflictCheck: string;
    detailArtifact: string;
    followUpTask: string;
    id?: string;
    scope: string;
    status?: string;
    decision?: string;
    [key: string]: unknown;
  }>;
  materialIssues: Array<{ code?: string; message?: string; [key: string]: unknown }>;
  migrationSnapshot?: { strictDeferred?: boolean; [key: string]: unknown };
  archiveMetadata?: Record<string, string>;
  phases: HarnessTestLoosePhase[];
  queueReasons: Array<{ code: string; message?: string; [key: string]: unknown }>;
  queues: string[];
  repairPrompt: string;
  supersedes: string[];
  taskQueues: string[];
  walkthroughPath?: string;
  [key: string]: unknown;
};

export type HarnessTestLooseTaskCollection = {
  [index: number]: HarnessTestLooseTask;
  length: number;
  every(predicate: (value: HarnessTestLooseTask, index: number, obj: HarnessTestLooseTask[]) => unknown): boolean;
  filter(predicate: (value: HarnessTestLooseTask, index: number, obj: HarnessTestLooseTask[]) => unknown): HarnessTestLooseTask[];
  find(predicate: (value: HarnessTestLooseTask, index: number, obj: HarnessTestLooseTask[]) => unknown): HarnessTestLooseTask;
  map<TResult>(callback: (value: HarnessTestLooseTask, index: number, obj: HarnessTestLooseTask[]) => TResult): TResult[];
  some(predicate: (value: HarnessTestLooseTask, index: number, obj: HarnessTestLooseTask[]) => unknown): boolean;
};

export type HarnessTestLooseJson = {
  [key: string]: unknown;
  action: string;
  applied: boolean;
  archiveMetadata: Record<string, string>;
  actions: HarnessTestLooseAction[];
  actionsApplied: HarnessTestLooseAction[];
  audit: { manifestRequired?: boolean; [key: string]: unknown };
  capabilities: HarnessTestLooseCapability[] & { locale: string; names: string[] };
  changes: HarnessTestLooseChange[];
  compatibleBudgets: string[];
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
  prompt: string;
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
  schemaVersion: number | string;
  skipped: number;
  source: string;
  sourceFileHashes: Record<string, string>;
  status: string;
  summary: { briefCoverage?: { missing: number }; [key: string]: unknown };
  target: string;
  targets: Array<{ agent: string; changes: HarnessTestLooseChange[]; version: string }>;
  task: HarnessTestLooseTask;
  tasks: HarnessTestLooseTaskCollection;
  templateValues: Record<string, { from: string }>;
  workbench: { migrationQueueSchema?: string; [key: string]: unknown };
  writeScopes: Array<{ path: string; [key: string]: unknown }>;
  followUpTask: { id: string; path: string; shortId: string; [key: string]: unknown };
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
