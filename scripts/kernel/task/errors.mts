export type TaskKernelError =
  | TaskNotFoundError
  | TaskRefAmbiguousError
  | InvalidTaskStateError
  | HumanConfirmationRequiredError
  | WriteScopeViolationError
  | ProjectionDriftError
  | LegacyFallbackDetectedError
  | TaskKernelNotImplementedError;

export type TaskKernelErrorTag = TaskKernelError["_tag"];

export class TaskNotFoundError extends Error {
  readonly _tag = "TaskNotFound" as const;

  constructor(message = "Task not found") {
    super(message);
    this.name = this._tag;
  }
}

export class TaskRefAmbiguousError extends Error {
  readonly _tag = "TaskRefAmbiguous" as const;

  constructor(message = "Task reference is ambiguous") {
    super(message);
    this.name = this._tag;
  }
}

export class InvalidTaskStateError extends Error {
  readonly _tag = "InvalidTaskState" as const;

  constructor(message = "Invalid task state") {
    super(message);
    this.name = this._tag;
  }
}

export class HumanConfirmationRequiredError extends Error {
  readonly _tag = "HumanConfirmationRequired" as const;

  constructor(message = "Human confirmation is required") {
    super(message);
    this.name = this._tag;
  }
}

export class WriteScopeViolationError extends Error {
  readonly _tag = "WriteScopeViolation" as const;

  constructor(message = "Write scope violation") {
    super(message);
    this.name = this._tag;
  }
}

export class ProjectionDriftError extends Error {
  readonly _tag = "ProjectionDrift" as const;

  constructor(message = "Generated projection drift detected") {
    super(message);
    this.name = this._tag;
  }
}

export class LegacyFallbackDetectedError extends Error {
  readonly _tag = "LegacyFallbackDetected" as const;

  constructor(message = "Legacy fallback dependency detected") {
    super(message);
    this.name = this._tag;
  }
}

export class TaskKernelNotImplementedError extends Error {
  readonly _tag = "TaskKernelNotImplemented" as const;

  constructor(serviceId: string, methodName: string) {
    super(`${serviceId}.${methodName} is reserved for a later Task Kernel implementation wave`);
    this.name = this._tag;
  }
}
