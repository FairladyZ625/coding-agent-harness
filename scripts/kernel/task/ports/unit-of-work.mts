import type { Effect } from "effect";

import type { WriteScope } from "../domain/index.mjs";
import type { TaskKernelError } from "../errors.mjs";

export const GIT_UNIT_OF_WORK_PORT_ID = "coding-agent-harness/task-kernel/ports/GitUnitOfWork";

export type GitUnitOfWorkInput = Readonly<{
  label: string;
  writeScope: WriteScope;
  evidenceRefs?: readonly string[];
}>;

export type GitUnitOfWorkResult<A> = Readonly<{
  value: A;
  evidenceRefs: readonly string[];
}>;

export type GitUnitOfWorkServiceShape = Readonly<{
  identity: typeof GIT_UNIT_OF_WORK_PORT_ID;
  transact: <A, E, R>(
    input: GitUnitOfWorkInput,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<GitUnitOfWorkResult<A>, E | TaskKernelError, R>;
}>;
