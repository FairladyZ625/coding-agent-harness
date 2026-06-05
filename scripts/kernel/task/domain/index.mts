export const taskKernelDomainBoundary = {
  layer: "domain",
  purpose: "Task Kernel domain contracts and policy implementations.",
} as const;

export type {
  ArtifactId,
  ModuleKey,
  PhaseId,
  TaskId,
  TaskRef,
  TaskRelation,
  TaskRelationType,
} from "./identity.mjs";
export {
  assertUniqueTaskIds,
  assertUniqueValues,
  createTaskRef,
  createTaskRelation,
  parseArtifactId,
  parseModuleKey,
  parsePhaseId,
  parseTaskId,
  taskRelationTypes,
} from "./identity.mjs";

export type {
  CloseoutState,
  LifecycleState,
  QueueName,
  ReviewStatus,
  TaskState,
} from "./states.mjs";
export {
  CloseoutStates,
  LifecycleStates,
  QueueNames,
  ReviewStatuses,
  TaskStates,
  parseCloseoutState,
  parseLifecycleState,
  parseQueueName,
  parseReviewStatus,
  parseTaskState,
} from "./states.mjs";

export type {
  AgentActor,
  CreateTaskInput,
  HumanActor,
  MaterialsState,
  ModulePlacement,
  ReviewActor,
  ReviewConfirmation,
  Task,
  TaskArtifact,
  TaskPhase,
} from "./task.mjs";
export {
  createHumanReviewConfirmation,
  createTask,
  createTaskArtifact,
  createTaskPhase,
} from "./task.mjs";

export type {
  GeneratedProjection,
  Module,
  WriteScope,
} from "./supporting-models.mjs";
export {
  createGeneratedProjection,
  createModule,
  createWriteScope,
  isPathAllowedByWriteScope,
} from "./supporting-models.mjs";

export type {
  PolicyDecision,
  QueuePolicyInput,
  TaskReadinessDecision,
} from "./policies.mjs";
export {
  assertAgentReviewTransition,
  canAgentSetReviewStatus,
  classifyTaskQueue,
  decideArchiveEligibility,
  decideDeleteEligibility,
  decideTaskReadiness,
  deriveReviewStatus,
  determineMaterialsState,
} from "./policies.mjs";
