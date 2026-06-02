export type TaskRef = {
  id?: string;
  path?: string;
};

export type TaskLocation = {
  id: string;
  directory: string;
  taskPlanPath: string;
};

export type TaskTombstonePolicyFacts = {
  state?: string;
  budget?: string;
  closeoutStatus?: string;
  reviewSubmitted?: unknown;
  reviewStatus?: string;
  reviewConfirmation?: ({ confirmed?: unknown } & Record<string, unknown>) | null;
  materialsReady?: boolean;
  evidence?: unknown[];
  taskQueues?: string[];
  risks?: Array<{ id?: string; open?: unknown; blocksRelease?: unknown; severity?: unknown }>;
  deletionState?: string;
};

export type TaskTombstoneSubject = {
  id: string;
  location: TaskLocation;
  paths: {
    directory: string;
    taskPlanPath: string;
    progressPath: string;
    relativeDirectory: string;
    relativeTaskPlanPath: string;
    relativeProgressPath: string;
  };
  policy: TaskTombstonePolicyFacts;
};

export type TombstoneSubjectReader = {
  getTombstoneSubject(ref: TaskRef): TaskTombstoneSubject;
};
