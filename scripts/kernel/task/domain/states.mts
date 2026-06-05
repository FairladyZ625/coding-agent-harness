const taskStates = ["planned", "active", "review", "blocked", "done", "archived", "deleted"] as const;
const lifecycleStates = ["ready", "active", "in_review", "closed-review-pending"] as const;
const reviewStatuses = ["missing", "required", "agent-reviewed", "human-confirmed"] as const;
const closeoutStates = ["not-required", "open", "ready-to-close", "closed"] as const;
const queueNames = ["planned", "active", "review", "blocked", "done", "archived", "deleted", "missing-materials", "lessons"] as const;

export type TaskState = (typeof taskStates)[number];
export type LifecycleState = (typeof lifecycleStates)[number];
export type ReviewStatus = (typeof reviewStatuses)[number];
export type CloseoutState = (typeof closeoutStates)[number];
export type QueueName = (typeof queueNames)[number];

export const TaskStates = taskStates;
export const LifecycleStates = lifecycleStates;
export const ReviewStatuses = reviewStatuses;
export const CloseoutStates = closeoutStates;
export const QueueNames = queueNames;

export function parseTaskState(raw: string): TaskState {
  return parseEnum(raw, taskStates, "TaskState");
}

export function parseLifecycleState(raw: string): LifecycleState {
  return parseEnum(raw, lifecycleStates, "LifecycleState");
}

export function parseReviewStatus(raw: string): ReviewStatus {
  return parseEnum(raw, reviewStatuses, "ReviewStatus");
}

export function parseCloseoutState(raw: string): CloseoutState {
  return parseEnum(raw, closeoutStates, "CloseoutState");
}

export function parseQueueName(raw: string): QueueName {
  return parseEnum(raw, queueNames, "QueueName");
}

function parseEnum<const T extends readonly string[]>(raw: string, allowed: T, label: string): T[number] {
  const value = raw.trim();
  if ((allowed as readonly string[]).includes(value)) return value as T[number];
  throw new Error(`Invalid ${label}: ${JSON.stringify(raw)}`);
}
