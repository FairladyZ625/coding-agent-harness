import type { normalizeTarget } from "../core-shared.mjs";
import type { TaskRecord } from "../task-repository.mjs";

export type CheckHarnessPaths = {
  version: number;
  harnessRoot: string;
  planningRoot: string;
  ledgerPath: string;
  closeoutIndexPath: string;
  regressionRoot: string;
};

export type CheckTarget = ReturnType<typeof normalizeTarget> & {
  input: string;
  docsOnly: boolean;
  docsRoot: string;
  projectRoot: string;
  harness: CheckHarnessPaths;
};

export type ValidationResult = {
  failures: string[];
  warnings: string[];
};

export type BuildStatusOptions = {
  skipLegacyCheck?: boolean;
  strict?: boolean;
  strictLegacy?: boolean;
  allowLegacyTarget?: boolean;
};

export type PresetPackage = {
  version: string | number;
  task?: {
    kind?: string;
  };
  evidence?: {
    bundleDir?: string;
    files?: Record<string, unknown>;
  };
  audit?: {
    evidenceFiles?: string[];
  };
  resources?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type ScannedTask = TaskRecord;
