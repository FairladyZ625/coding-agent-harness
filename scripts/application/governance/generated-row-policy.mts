import type { TaskGovernanceProjection } from "../../lib/types/task-repository.js";

type LifecycleProjection = NonNullable<TaskGovernanceProjection["taskLifecycleProjection"]>;

export type GeneratedGovernanceRowPolicyOptions = {
  today: string;
};

export type GeneratedGovernanceRows = {
  ledgerRows: string[][];
  taskIndexRows: string[][];
  closeoutRows: string[][];
};

export function projectGeneratedGovernanceRows(tasks: TaskGovernanceProjection[], options: GeneratedGovernanceRowPolicyOptions): GeneratedGovernanceRows {
  return {
    ledgerRows: tasks.map((task) => projectLedgerRow(task, options)),
    taskIndexRows: tasks.map(projectTaskIndexRow),
    closeoutRows: tasks.map((task) => projectCloseoutRow(task, options)),
  };
}

export function projectLedgerRow(task: TaskGovernanceProjection, options: GeneratedGovernanceRowPolicyOptions): string[] {
  const plan = stripTarget(task.taskPlanPath || `${stripTarget(task.path)}/task_plan.md`);
  const scope = task.module ? "module" : "task";
  const moduleKey = task.module || "none";
  const lifecycle = taskLifecycleProjection(task);
  return [
    taskLedgerId(task),
    scope,
    moduleKey,
    task.title || task.shortId || task.id || "task",
    mapLedgerState(lifecycle.state),
    lifecycle.taskQueues.length ? lifecycle.taskQueues.join(",") : "none",
    plan,
    lifecycle.reviewStatus === "confirmed" ? stripTarget(task.reviewPath) : (lifecycle.reviewStatus || "pending"),
    lifecycle.lessonCandidateDecisionComplete ? "checked" : "pending",
    task.walkthroughPath ? stripTarget(task.walkthroughPath) : (lifecycle.closeoutStatus || "pending"),
    residual(task),
    options.today,
  ];
}

export function projectTaskIndexRow(task: TaskGovernanceProjection): string[] {
  const lifecycle = taskLifecycleProjection(task);
  return [
    task.taskKey || task.id || "task",
    task.title || task.shortId || task.id || "task",
    lifecycle.state,
    lifecycle.lifecycleState,
    lifecycle.reviewStatus,
    task.closeoutStatus || "",
    task.walkthroughPath || "pending",
  ];
}

export function projectCloseoutRow(task: TaskGovernanceProjection, options: GeneratedGovernanceRowPolicyOptions): string[] {
  const lifecycle = taskLifecycleProjection(task);
  return [
    `CO-${taskSlug(task)}`,
    task.taskKey || task.id || "task",
    lifecycle.closeoutStatus || "missing",
    stripTarget(task.walkthroughPath) || "pending",
    lifecycle.reviewStatus || "pending",
    lifecycle.lessonCandidateDecisionComplete ? "checked" : "pending",
    residual(task),
    options.today,
  ];
}

function residual(task: TaskGovernanceProjection): string {
  if (Array.isArray(task.stateConflicts) && task.stateConflicts.length) return `state-conflicts:${task.stateConflicts.length}`;
  if (Array.isArray(task.materialIssues) && task.materialIssues.length) return `material-issues:${task.materialIssues.length}`;
  return "none";
}

function taskLedgerId(task: TaskGovernanceProjection): string {
  return `HL-${taskSlug(task)}`;
}

function taskSlug(task: TaskGovernanceProjection): string {
  return String(task.shortId || task.id || "task").replace(/^TASKS\//, "").replace(/^MODULES\//, "").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 72);
}

function stripTarget(value: unknown): string {
  return String(value || "").replace(/^TARGET:/, "");
}

function taskLifecycleProjection(task: TaskGovernanceProjection): LifecycleProjection {
  const projection = task.taskLifecycleProjection;
  if (projection && typeof projection === "object") return projection;
  return {
    state: "unknown",
    lifecycleState: "unknown",
    reviewStatus: "missing",
    reviewQueueState: "not-in-queue",
    closeoutStatus: "missing",
    taskQueues: [],
    materialsReady: false,
    reviewSubmitted: false,
    lessonCandidateDecisionComplete: false,
    deletionState: "active",
  };
}

function mapLedgerState(state: unknown): string {
  if (state === "in_progress") return "active";
  if (state === "review") return "review";
  if (state === "done") return "closed";
  if (state === "blocked") return "blocked";
  return "planned";
}
