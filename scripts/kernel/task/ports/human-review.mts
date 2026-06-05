import type { Effect } from "effect";

import type { ReviewConfirmation, TaskRef } from "../domain/index.mjs";
import type { TaskKernelError } from "../errors.mjs";

export const HUMAN_REVIEW_PORT_ID = "coding-agent-harness/task-kernel/ports/HumanReviewPort";

export type HumanReviewConfirmationInput = Readonly<{
  ref: TaskRef;
  humanActorId: string;
  evidence: string;
  confirmedAt: Date;
}>;

export type HumanReviewPortServiceShape = Readonly<{
  identity: typeof HUMAN_REVIEW_PORT_ID;
  confirm: (input: HumanReviewConfirmationInput) => Effect.Effect<ReviewConfirmation, TaskKernelError>;
}>;
