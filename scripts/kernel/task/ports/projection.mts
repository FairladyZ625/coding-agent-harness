import type { Effect } from "effect";

import type { GeneratedProjection, TaskId } from "../domain/index.mjs";
import type { TaskKernelError } from "../errors.mjs";

export const GENERATED_PROJECTION_PORT_ID = "coding-agent-harness/task-kernel/ports/GeneratedProjectionPort";

export type ProjectionScopeInput = Readonly<{
  sourceTaskIds?: readonly TaskId[];
  profile?: string;
}>;

export type ProjectionDriftReport = Readonly<{
  projection: GeneratedProjection;
  drifted: boolean;
  evidenceRefs: readonly string[];
}>;

export type GeneratedProjectionPortServiceShape = Readonly<{
  identity: typeof GENERATED_PROJECTION_PORT_ID;
  rebuild: (input: ProjectionScopeInput) => Effect.Effect<readonly GeneratedProjection[], TaskKernelError>;
  detectDrift: (input: ProjectionScopeInput) => Effect.Effect<readonly ProjectionDriftReport[], TaskKernelError>;
}>;
