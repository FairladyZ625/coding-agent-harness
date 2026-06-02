#!/usr/bin/env node

import { assessArchiveEligibility } from "../scripts/lib/task-archive-eligibility.mjs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const confirmedReviewTask = {
  state: "review",
  budget: "standard",
  closeoutStatus: "pending",
  reviewStatus: "confirmed",
  materialsReady: true,
  deletionState: "active",
  taskQueues: ["finalized"],
  risks: [],
  reviewConfirmation: {
    confirmed: true,
    confirmationId: "HRC-202606020900",
    confirmedAt: "2026-06-02 09:00",
    reviewer: "Release Reviewer",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    gitAudit: { valid: true },
  },
};

const eligible = assessArchiveEligibility(confirmedReviewTask, {
  archivedBy: "Release Manager <release@example.invalid>",
  now: "2026-06-02T09:05:00.000Z",
});
assert(eligible.eligible === true, "human-confirmed review tasks should be archive-eligible without a second closeout action");
assert(eligible.auditFields["Archived By"] === "Release Manager <release@example.invalid>", "archive eligibility should preserve the accountable archive actor");

const unconfirmedReviewTask = {
  ...confirmedReviewTask,
  reviewStatus: "agent-reviewed",
  taskQueues: ["review"],
  reviewConfirmation: { confirmed: false },
};
const unconfirmed = assessArchiveEligibility(unconfirmedReviewTask, {
  archivedBy: "Release Manager <release@example.invalid>",
});
assert(unconfirmed.eligible === false, "unconfirmed review tasks must not become archive eligible");
assert(unconfirmed.reason === "state:review", "unconfirmed review tasks should still be blocked by raw lifecycle state");

const rawFinalizedPollutionTask = {
  ...confirmedReviewTask,
  reviewStatus: "agent-reviewed",
  taskQueues: ["finalized"],
  reviewConfirmation: { confirmed: false },
};
const rawFinalizedPollution = assessArchiveEligibility(rawFinalizedPollutionTask, {
  archivedBy: "Release Manager <release@example.invalid>",
});
assert(rawFinalizedPollution.eligible === false, "raw finalized queue must not make unconfirmed review tasks archive eligible");
assert(rawFinalizedPollution.reason === "state:review", "archive eligibility must not trust raw finalized queue as review evidence");

const blockedConfirmedTask = {
  ...confirmedReviewTask,
  risks: [{ severity: "P1", open: true, blocksRelease: true }],
};
const blocked = assessArchiveEligibility(blockedConfirmedTask, {
  archivedBy: "Release Manager <release@example.invalid>",
});
assert(blocked.eligible === false, "open blocking findings must still prevent archive");
assert(blocked.reason.includes("open blocking review findings"), "blocking archive failure should explain the review finding gate");

console.log("Task archive eligibility tests passed");
