import {
  type ExpectedCompatibilitySnapshot,
  type ExpectedFieldClassification,
  type ExpectedPolicySnapshot,
  type ExpectedTaskSnapshot,
  type TaskKernelDivergenceSeedRecord,
  type TaskKernelExpectedRecord,
  taskKernelFixtureSchemaVersion,
} from "./schema.mjs";

const noDataLossFields: readonly ExpectedFieldClassification[] = [
  { field: "id", classification: "domain field", owner: "domain" },
  { field: "title", classification: "domain field", owner: "domain" },
  { field: "state", classification: "domain field", owner: "domain" },
  { field: "lifecycleState", classification: "domain field", owner: "domain" },
  { field: "reviewStatus", classification: "domain field", owner: "domain" },
  { field: "closeoutState", classification: "domain field", owner: "domain" },
  { field: "materials", classification: "domain field", owner: "domain" },
  { field: "queue", classification: "generated projection field", owner: "projection" },
  { field: "readiness", classification: "generated projection field", owner: "projection" },
  { field: "archiveEligibility", classification: "generated projection field", owner: "projection" },
  { field: "deleteEligibility", classification: "generated projection field", owner: "projection" },
  { field: "agentCanSetHumanConfirmed", classification: "generated projection field", owner: "projection" },
  { field: "modulePlacement", classification: "domain field", owner: "domain" },
  { field: "relations", classification: "domain field", owner: "domain" },
  { field: "phases", classification: "domain field", owner: "domain" },
  { field: "artifacts", classification: "domain field", owner: "domain" },
  { field: "auditMetadata", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.archivedAt", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.blockerReason", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.createdBy", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.defaultVisibility", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.deletedAt", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.evidenceBundle", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.fixtureOwner", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.presetVersion", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.sharedScope", classification: "adapter-only display field", owner: "adapter" },
  { field: "auditMetadata.tombstone", classification: "adapter-only display field", owner: "adapter" },
  { field: "reviewConfirmation", classification: "domain field", owner: "domain" },
  { field: "reviewConfirmation.actor", classification: "domain field", owner: "domain" },
  { field: "reviewConfirmation.confirmedAt", classification: "domain field", owner: "domain" },
  { field: "reviewConfirmation.evidence", classification: "domain field", owner: "domain" },
];

const agentCannotHumanConfirm = {
  allowed: false,
  reasons: ["human-confirmed requires the human review adapter"],
} as const;

const taskPathPrefix = "planning/modules/task-kernel/tasks";

const baseTask: ExpectedTaskSnapshot = {
  id: "2026-06-05-active-standard-task",
  title: "Active standard task",
  state: "active",
  lifecycleState: "active",
  reviewStatus: "missing",
  closeoutState: "open",
  materials: { kind: "complete", required: ["ART-001"] },
  phases: [
    { id: "INIT-01", title: "Initialize fixture", order: 0 },
    { id: "GATE-01", title: "Verify fixture", order: 1 },
  ],
  artifacts: [{ id: "ART-001", title: "Fixture task plan" }],
  relations: [],
  auditMetadata: { fixtureOwner: "TK-04a" },
};

function compatibility(): ExpectedCompatibilitySnapshot {
  return {
    oldRuntimeOutputs: {
      taskListJson: "not-captured-by-tk04a",
      dashboardTaskIndex: "not-captured-by-tk04a",
      moduleOutput: "not-captured-by-tk04a",
    },
    newKernelQueryOutput: "expected-task-and-policy-snapshot",
    diffClassification: {
      state: "tk04b-owned-pending-oracle-comparison",
      owner: "TK-04b",
      policyRef: "divergence-resolution-policy.md",
      requiredDecision: "Compare old runtime outputs against these expected task/policy snapshots in TK-04b.",
    },
    decision: {
      kind: "tk04b-owned-pending-oracle-comparison",
      owner: "TK-04b",
      expiry: "kernel-cutover",
    },
    noDataLossFields,
  };
}

function policy(input: Partial<ExpectedPolicySnapshot>): ExpectedPolicySnapshot {
  return {
    queue: "active",
    readiness: { allowed: true, ready: true, reasons: [] },
    archiveEligibility: { allowed: false, reasons: ["task state is active", "closeout is open"] },
    deleteEligibility: { allowed: false, reasons: ["task must be archived before deletion", "closeout is open"] },
    agentCanSetHumanConfirmed: agentCannotHumanConfirm,
    ...input,
  };
}

function record(input: {
  id: TaskKernelExpectedRecord["id"];
  covers: string;
  requiredFor: readonly string[];
  task: ExpectedTaskSnapshot;
  policy: ExpectedPolicySnapshot;
}): TaskKernelExpectedRecord {
  return {
    id: input.id,
    schemaVersion: taskKernelFixtureSchemaVersion,
    ownerChildTask: "TK-04a",
    covers: input.covers,
    requiredFor: input.requiredFor,
    task: input.task,
    policy: input.policy,
    compatibility: compatibility(),
  };
}

export const taskKernelExpectedFixtures: readonly TaskKernelExpectedRecord[] = [
  record({
    id: "active-standard-task",
    covers: "normal planned/active task package",
    requiredFor: ["entity parser", "list/detail"],
    task: baseTask,
    policy: policy({}),
  }),
  record({
    id: "review-ready-task",
    covers: "agent-reviewed but not human-confirmed",
    requiredFor: ["review boundary"],
    task: {
      ...baseTask,
      id: "2026-06-05-review-ready-task",
      title: "Review ready task",
      state: "review",
      lifecycleState: "in_review",
      reviewStatus: "agent-reviewed",
      closeoutState: "ready-to-close",
      artifacts: [{ id: "ART-001", title: "Agent review report" }],
    },
    policy: policy({
      queue: "review",
      archiveEligibility: { allowed: false, reasons: ["task state is review", "closeout is ready-to-close"] },
      deleteEligibility: { allowed: false, reasons: ["task must be archived before deletion", "closeout is ready-to-close"] },
    }),
  }),
  record({
    id: "human-confirmed-task",
    covers: "Git-backed human confirmation evidence",
    requiredFor: ["finalized queue"],
    task: {
      ...baseTask,
      id: "2026-06-05-human-confirmed-task",
      title: "Human confirmed task",
      state: "done",
      lifecycleState: "closed-review-pending",
      reviewStatus: "human-confirmed",
      closeoutState: "closed",
      reviewConfirmation: {
        actor: { kind: "human", id: "reviewer-1" },
        confirmedAt: "2026-06-05T00:00:00.000Z",
        evidence: "git:human-review-confirmation-sha",
      },
    },
    policy: policy({
      queue: "done",
      archiveEligibility: { allowed: true, reasons: [] },
      deleteEligibility: { allowed: false, reasons: ["task must be archived before deletion"] },
    }),
  }),
  record({
    id: "missing-materials-task",
    covers: "missing review/progress/artifacts fields",
    requiredFor: ["materials gate"],
    task: {
      ...baseTask,
      id: "2026-06-05-missing-materials-task",
      title: "Missing materials task",
      materials: { kind: "missing", required: ["ART-001", "ART-002"], missing: ["ART-002"] },
    },
    policy: policy({
      queue: "missing-materials",
      readiness: { allowed: false, ready: false, reasons: ["missing materials: ART-002"] },
    }),
  }),
  record({
    id: "blocked-task",
    covers: "blocker state and reason",
    requiredFor: ["lifecycle policy"],
    task: {
      ...baseTask,
      id: "2026-06-05-blocked-task",
      title: "Blocked task",
      state: "blocked",
      lifecycleState: "active",
      auditMetadata: { fixtureOwner: "TK-04a", blockerReason: "waiting-for-domain-export" },
    },
    policy: policy({
      queue: "blocked",
      readiness: { allowed: false, ready: false, reasons: ["task is blocked"] },
      archiveEligibility: { allowed: false, reasons: ["task state is blocked", "closeout is open"] },
    }),
  }),
  record({
    id: "archived-task",
    covers: "archive metadata and hidden/default visibility",
    requiredFor: ["archive query"],
    task: {
      ...baseTask,
      id: "2026-06-05-archived-task",
      title: "Archived task",
      state: "archived",
      lifecycleState: "closed-review-pending",
      reviewStatus: "agent-reviewed",
      closeoutState: "closed",
      auditMetadata: { fixtureOwner: "TK-04a", archivedAt: "2026-06-05T00:00:00.000Z", defaultVisibility: "hidden" },
    },
    policy: policy({
      queue: "archived",
      archiveEligibility: { allowed: true, reasons: [] },
      deleteEligibility: { allowed: true, reasons: [] },
    }),
  }),
  record({
    id: "soft-deleted-task",
    covers: "tombstone and replacement edge",
    requiredFor: ["delete/reopen"],
    task: {
      ...baseTask,
      id: "2026-06-05-soft-deleted-task",
      title: "Soft deleted task",
      state: "deleted",
      lifecycleState: "closed-review-pending",
      closeoutState: "closed",
      relations: [
        {
          type: "superseded-by",
          target: { kind: "task-id", value: "2026-06-05-active-standard-task" },
        },
      ],
      auditMetadata: { fixtureOwner: "TK-04a", deletedAt: "2026-06-05T00:00:00.000Z", tombstone: "true" },
    },
    policy: policy({
      queue: "deleted",
      readiness: { allowed: false, ready: false, reasons: ["task is deleted"] },
      archiveEligibility: { allowed: false, reasons: ["deleted tasks cannot be archived", "task state is deleted"] },
      deleteEligibility: { allowed: false, reasons: ["task must be archived before deletion"] },
    }),
  }),
  record({
    id: "relation-parent-child",
    covers: "parent/child and dependency links",
    requiredFor: ["relation graph"],
    task: {
      ...baseTask,
      id: "2026-06-05-relation-parent-child",
      title: "Relation parent child task",
      relations: [
        { type: "parent", target: { kind: "task-id", value: "2026-06-05-task-kernel-master-derivation-program" } },
        { type: "child", target: { kind: "task-id", value: "2026-06-05-active-standard-task" } },
        { type: "depends-on", target: { kind: "task-id", value: "2026-06-05-task-kernel-tk01-domain-model" } },
      ],
    },
    policy: policy({}),
  }),
  record({
    id: "module-owned-task",
    covers: "module placement and shared scope",
    requiredFor: ["module query"],
    task: {
      ...baseTask,
      id: "2026-06-05-module-owned-task",
      title: "Module owned task",
      modulePlacement: {
        moduleKey: "task-kernel",
        taskPath: `${taskPathPrefix}/2026-06-05-module-owned-task`,
      },
    },
    policy: policy({}),
  }),
  record({
    id: "multi-module-task",
    covers: "task with cross-module relations and shared scope",
    requiredFor: ["relation graph", "module query boundary"],
    task: {
      ...baseTask,
      id: "2026-06-05-multi-module-task",
      title: "Multi module task",
      modulePlacement: {
        moduleKey: "task-kernel",
        taskPath: `${taskPathPrefix}/2026-06-05-multi-module-task`,
      },
      relations: [
        { type: "depends-on", target: { kind: "module-path", value: "planning/modules/architecture" } },
        { type: "feeds-gate", target: { kind: "module-path", value: "planning/modules/dashboard" } },
      ],
      auditMetadata: { fixtureOwner: "TK-04a", sharedScope: "tests/**,scripts/kernel/task/**" },
    },
    policy: policy({}),
  }),
  record({
    id: "preset-created-task",
    covers: "preset evidence bundle and provenance",
    requiredFor: ["create task command"],
    task: {
      ...baseTask,
      id: "2026-06-05-preset-created-task",
      title: "Preset created task",
      artifacts: [
        { id: "ART-001", title: "Preset manifest" },
        { id: "ART-002", title: "Preset audit" },
      ],
      materials: { kind: "complete", required: ["ART-001", "ART-002"] },
      auditMetadata: {
        fixtureOwner: "TK-04a",
        createdBy: "coding-agent-harness-task",
        presetVersion: "2",
        evidenceBundle: "artifacts/preset/2026-06-05T04-27-57-195Z",
      },
    },
    policy: policy({}),
  }),
];

export const taskKernelDivergenceSeeds: readonly TaskKernelDivergenceSeedRecord[] = [
  {
    id: "queue-divergence-task",
    schemaVersion: taskKernelFixtureSchemaVersion,
    ownerChildTask: "TK-04b",
    difference: "CLI/Dashboard/module disagree on queue",
    classification: {
      state: "tk04b-owned-pending-oracle-comparison",
      owner: "TK-04b",
      policyRef: "divergence-resolution-policy.md",
      requiredDecision: "Select TaskQueueProjection rule.",
    },
  },
  {
    id: "active-predicate-divergence-task",
    schemaVersion: taskKernelFixtureSchemaVersion,
    ownerChildTask: "TK-04b",
    difference: "active counts differ by consumer",
    classification: {
      state: "tk04b-owned-pending-oracle-comparison",
      owner: "TK-04b",
      policyRef: "divergence-resolution-policy.md",
      requiredDecision: "Select TaskSummaryProjection.active rule.",
    },
  },
  {
    id: "review-boundary-divergence-task",
    schemaVersion: taskKernelFixtureSchemaVersion,
    ownerChildTask: "TK-04b",
    difference: "agent-reviewed displayed as confirmable/finalized",
    classification: {
      state: "tk04b-owned-pending-oracle-comparison",
      owner: "TK-04b",
      policyRef: "divergence-resolution-policy.md",
      requiredDecision: "Select ReviewWorkbenchProjection rule.",
    },
  },
  {
    id: "generated-stale-row-task",
    schemaVersion: taskKernelFixtureSchemaVersion,
    ownerChildTask: "TK-04b",
    difference: "task truth differs from generated row",
    classification: {
      state: "tk04b-owned-pending-oracle-comparison",
      owner: "TK-04b",
      policyRef: "divergence-resolution-policy.md",
      requiredDecision: "Projection rebuild wins.",
    },
  },
];
